import { fileURLToPath } from "node:url";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type { TeletronixFile } from "../src/engine/schema/program.ts";

export type { Locator, Page };
export { expect };
export type Program = TeletronixFile;

/** A one-screen program, for tests that only need some content on screen. */
export const oneScreen = (
    content: NonNullable<Program["screens"]["home"]>["content"],
): Program => ({
    config: { name: "Test", start: "home" },
    screens: { home: { content } },
});

/**
 * Serves the test images in e2e/fixtures at `e2e-images/<name>` (e.g. one with a bright,
 * saturated spot to check blending by). Only for the tests that need them: in Firefox, a
 * route takes requests from the offline cache's service worker.
 */
export async function serveTestImages(page: Page): Promise<void> {
    await page.route("**/e2e-images/*", (route) =>
        route.fulfill({
            path: fileURLToPath(
                new URL(`fixtures/${route.request().url().split("/").at(-1)}`, import.meta.url),
            ),
        }),
    );
}

/** The running player, as a user sees it. */
export class Player {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    /**
     * Plays a program: one of `public/data`, by name, or one written in the test, which is
     * served (as `data/e2e.json`) to this page only.
     */
    async open(program: Program | string, query = ""): Promise<void> {
        let name = program;
        if (typeof program !== "string") {
            name = "e2e";
            await this.page.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        }
        await this.page.goto(`./?data=${name}${query}`);
        // the program runs, or the player explains why it can't
        await this.page.locator(".screen, .error-view").first().waitFor();
        const error = this.page.locator(".error-view");
        if (await error.count())
            throw new Error(`The program didn't load: ${await error.innerText()}`);
    }

    /** The current screen (not one that's leaving). */
    get screen(): Locator {
        return this.page.locator(".screen:not(.outgoing)");
    }

    /** The screen that's leaving, during a glitch or fade transition. */
    get outgoing(): Locator {
        return this.page.locator(".screen.outgoing");
    }

    link(text: string | RegExp): Locator {
        return this.screen.locator("button.link", { hasText: text });
    }

    get dialog(): Locator {
        return this.page.locator("dialog[open]");
    }

    /** Clicks the page's background (its top-left corner), as a player does to skip ahead. */
    async tap(): Promise<void> {
        await this.page.locator("main.terminal").click({ position: { x: 2, y: 2 } });
    }

    /** The text the player sees on the current screen, without the parts still hidden. */
    async text(): Promise<string> {
        return this.screen.evaluate((screen) => {
            const copy = screen.cloneNode(true) as HTMLElement;
            for (const hidden of copy.querySelectorAll(".sr-only, .reveal-hidden")) hidden.remove();
            return copy.textContent ?? "";
        });
    }
}

/** Counts the sounds the page starts, by watching Web Audio. */
export class AudioSpy {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    static install = () => {
        const counts = { contexts: 0, oscillators: 0, noise: 0, loops: 0, recipes: 0, stops: 0 };
        const state = { counts, context: null as AudioContext | null };
        (window as unknown as { __audio: typeof state }).__audio = state;
        const Real = window.AudioContext;
        if (!Real) return;
        window.AudioContext = class extends Real {
            constructor(...args: ConstructorParameters<typeof AudioContext>) {
                super(...args);
                counts.contexts++;
                state.context = this;
            }
            override createOscillator() {
                const node = super.createOscillator();
                const start = node.start.bind(node);
                node.start = (...args) => {
                    counts.oscillators++;
                    start(...args);
                };
                return node;
            }
            override createBufferSource() {
                const node = super.createBufferSource();
                const start = node.start.bind(node);
                const stop = node.stop.bind(node);
                node.stop = (...args) => {
                    if (node.loop) counts.stops++;
                    stop(...args);
                };
                node.start = (...args) => {
                    // the synth's shared noise buffer is 2s long; any other is a rendered recipe
                    // or an audio file
                    if (node.loop) counts.loops++;
                    else if (node.buffer && Math.abs(node.buffer.duration - 2) > 0.001)
                        counts.recipes++;
                    else counts.noise++;
                    start(...args);
                };
                return node;
            }
        };
    };

    /** How many sources of each kind have started, and the audio context's state. */
    counts(): Promise<{
        contexts: number;
        oscillators: number;
        noise: number;
        loops: number;
        recipes: number;
        /** Loops stopped, e.g. an ambience fading out */
        stops: number;
        state: AudioContextState | null;
        /** The audio clock, in seconds. */
        time: number;
    }> {
        return this.page.evaluate(() => {
            const { counts, context } = (
                window as unknown as {
                    __audio: { counts: Record<string, number>; context: AudioContext | null };
                }
            ).__audio;
            return {
                contexts: counts.contexts ?? 0,
                oscillators: counts.oscillators ?? 0,
                noise: counts.noise ?? 0,
                loops: counts.loops ?? 0,
                recipes: counts.recipes ?? 0,
                stops: counts.stops ?? 0,
                state: context?.state ?? null,
                time: context?.currentTime ?? 0,
            };
        });
    }

    /** How many sounds `action` starts, of each kind, waiting `settle` ms for them. */
    async during(
        action: () => Promise<unknown>,
        settle = 150,
    ): Promise<{ oscillators: number; noise: number; loops: number; recipes: number }> {
        const before = await this.counts();
        await action();
        await this.page.waitForTimeout(settle);
        const after = await this.counts();
        return {
            oscillators: after.oscillators - before.oscillators,
            noise: after.noise - before.noise,
            loops: after.loops - before.loops,
            recipes: after.recipes - before.recipes,
        };
    }
}

/**
 * A notice, not a fault: a layout that settles over two frames (e.g. a text box growing to
 * fit, in the editor) makes a browser say so, WebKit as an error.
 */
const BENIGN = /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;

interface Fixtures {
    player: Player;
    audio: AudioSpy;
    /** Console errors a test expects (e.g. a failed request it causes on purpose). */
    expectedErrors: RegExp[];
    /** Fails any test whose page throws or logs an error. */
    noErrors: undefined;
}

/**
 * Keeps the tests quiet: every page's audio goes out through a gain of nothing, and every
 * video plays at no volume. Sounds still start (the AudioSpy counts them), but nobody hears
 * them.
 */
function silence(): void {
    const Base = window.BaseAudioContext ?? window.AudioContext;
    const real = Base && Object.getOwnPropertyDescriptor(Base.prototype, "destination");
    if (real?.get) {
        const silent = new WeakMap<BaseAudioContext, GainNode>();
        Object.defineProperty(Base.prototype, "destination", {
            configurable: true,
            get(this: BaseAudioContext) {
                let gain = silent.get(this);
                if (!gain) {
                    gain = this.createGain();
                    gain.gain.value = 0;
                    gain.connect(real.get?.call(this) as AudioNode);
                    silent.set(this, gain);
                }
                return gain;
            },
        });
    }
    const volume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");
    if (volume?.set) {
        const set = volume.set;
        Object.defineProperty(HTMLMediaElement.prototype, "volume", {
            ...volume,
            set(this: HTMLMediaElement) {
                set.call(this, 0);
            },
        });
        // (a video that plays by itself never has its volume set)
        document.addEventListener(
            "play",
            (event) => {
                if (event.target instanceof HTMLMediaElement) set.call(event.target, 0);
            },
            true,
        );
    }
}

export const test = base.extend<Fixtures>({
    // every page in a test, the GM's windows too, is silent
    context: async ({ context }, use) => {
        await context.addInitScript(silence);
        await use(context);
    },
    expectedErrors: [[], { option: true }],
    noErrors: [
        async ({ page, expectedErrors }, use) => {
            const errors: string[] = [];
            const report = (text: string) => {
                if (BENIGN.test(text)) return;
                if (!expectedErrors.some((expected) => expected.test(text))) errors.push(text);
            };
            page.on("pageerror", (error) => report(String(error)));
            page.on("console", (message) => {
                if (message.type() === "error") report(message.text());
            });
            await use(undefined);
            expect(errors, "errors in the page").toEqual([]);
        },
        { auto: true },
    ],
    player: async ({ page }, use) => {
        await use(new Player(page));
    },
    audio: async ({ page }, use) => {
        await page.addInitScript(AudioSpy.install);
        await use(new AudioSpy(page));
    },
});
