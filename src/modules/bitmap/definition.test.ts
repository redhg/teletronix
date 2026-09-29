import { describe, expect, it } from "vitest";
import { seededRandom } from "../../engine/random.ts";
import { createTestTerminal, deferred, settle } from "../../engine/runtime/test-helpers.ts";
import {
    BITMAP_STEP_TIME,
    BITMAP_STEPS,
    type BitmapElement,
    BlendSchema,
    bitmapResolution,
    imageReveal,
} from "./definition.ts";

const DURATION = BITMAP_STEPS.length * BITMAP_STEP_TIME;

const FILE = {
    config: { name: "Test", defaults: { teletype: { speed: 10 } } },
    screens: {
        home: {
            content: ["ab", { type: "bitmap" as const, src: "map.png", alt: "Map" }, "cd"],
        },
        glitchy: {
            reveal: "glitch" as const,
            transition: "glitch" as const,
            content: ["ab", { type: "bitmap" as const, src: "map.png", alt: "Map" }, "cd"],
        },
    },
};

describe("bitmapResolution", () => {
    it("steps through the resolutions, from nothing to full", () => {
        expect(bitmapResolution(0)).toBe(0);
        expect(bitmapResolution(0.0001)).toBe(0.01);
        expect(bitmapResolution(0.5)).toBe(0.13);
        expect(bitmapResolution(0.999)).toBe(1);
        expect(bitmapResolution(1)).toBe(1);
    });
});

describe("bitmap", () => {
    it("reveals over its steps, reporting progress", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.start();
        ticker.advance(20);
        const run = terminal.getSnapshot().screen?.run;
        expect(run?.states).toEqual(["done", "active", "ready"]);

        const progress: number[] = [];
        run?.subscribeProgress(1, (p) => progress.push(p));
        ticker.advance(DURATION / 2);
        ticker.advance(DURATION / 2);
        expect(progress).toEqual([0, 0.5, 1]);
        expect(run?.states).toEqual(["done", "done", "active"]);
    });

    it("never joins a glitch block", () => {
        const { terminal } = createTestTerminal(FILE, { random: seededRandom(1) });
        terminal.navigate("glitchy");
        expect(terminal.getSnapshot().screen?.states).toEqual(["active", "ready", "ready"]);
    });

    it("waits at an element until it has loaded", async () => {
        const image = deferred();
        const { terminal, ticker } = createTestTerminal(FILE, {
            load: (element) => (element.type === "bitmap" ? image.promise : undefined),
        });
        terminal.start();
        const states = () => terminal.getSnapshot().screen?.states;
        expect(states()).toEqual(["active", "unloaded", "ready"]);

        ticker.advance(1000);
        expect(states()).toEqual(["done", "unloaded", "ready"]);
        expect(ticker.active).toBe(false);

        image.resolve();
        await settle();
        expect(states()).toEqual(["done", "active", "ready"]);
        expect(ticker.active).toBe(true);
        ticker.advance(DURATION);
        expect(states()).toEqual(["done", "done", "active"]);
    });

    it("goes on after a failed load", async () => {
        const image = deferred();
        const { terminal, ticker } = createTestTerminal(FILE, {
            load: (element) => (element.type === "bitmap" ? image.promise : undefined),
        });
        terminal.start();
        ticker.advance(20);
        image.reject(new Error("404"));
        await settle();
        expect(terminal.getSnapshot().screen?.states).toEqual(["done", "active", "ready"]);
    });

    it("doesn't wait if it loads before its turn", async () => {
        const { terminal, ticker } = createTestTerminal(FILE, {
            load: (element) => (element.type === "bitmap" ? Promise.resolve() : undefined),
        });
        terminal.start();
        await settle();
        ticker.advance(20);
        expect(terminal.getSnapshot().screen?.states).toEqual(["done", "active", "ready"]);
    });

    it("counts progress back down while its screen erases", () => {
        const { terminal, ticker } = createTestTerminal(FILE, { random: seededRandom(1) });
        terminal.start();
        terminal.skip();
        const old = terminal.getSnapshot().screen?.run;
        const progress: number[] = [];
        old?.subscribeProgress(1, (p) => progress.push(p));

        terminal.navigate("glitchy"); // a 1000ms glitch transition
        ticker.advance(500);
        ticker.advance(500);
        expect(progress).toEqual([1, 0.5, 0]);
    });
});

describe("blend", () => {
    it("takes a mode, blending with the background unless told otherwise", () => {
        expect(BlendSchema.parse("luminosity")).toEqual({ mode: "luminosity", with: "background" });
        expect(BlendSchema.parse({ mode: "difference" })).toEqual({
            mode: "difference",
            with: "background",
        });
        expect(BlendSchema.parse({ mode: "difference", with: "text" })).toEqual({
            mode: "difference",
            with: "text",
        });
    });

    it("rejects unknown modes", () => {
        expect(BlendSchema.safeParse("sparkle").success).toBe(false);
        expect(BlendSchema.safeParse({ mode: "luminosity", with: "border" }).success).toBe(false);
    });
});

describe("image reveals", () => {
    const image = (reveal?: object) =>
        ({ id: "i", type: "bitmap", src: "x.png", alt: "x", reveal }) as unknown as BitmapElement;

    it("default to pixelate, or instant when the screen reveals instantly", () => {
        expect(imageReveal(image(), false, false)).toEqual({ type: "pixelate", duration: 1650 });
        expect(imageReveal(image(), true, false)).toEqual({ type: "instant", duration: 0 });
    });

    it("use the image's own effect and speed, over the screen's", () => {
        expect(imageReveal(image({ type: "raster" }), true, false)).toEqual({
            type: "raster",
            duration: 2500,
        });
        expect(imageReveal(image({ type: "glitch", duration: 300 }), false, false)).toEqual({
            type: "glitch",
            duration: 300,
        });
    });

    it("are instant when everything is (reduced motion)", () => {
        expect(imageReveal(image({ type: "dissolve" }), false, true)).toEqual({
            type: "instant",
            duration: 0,
        });
    });
});
