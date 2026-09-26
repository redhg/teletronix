import type { Random } from "../random.ts";
import {
    createGlitchReveal,
    createReveal,
    type Frame,
    type Reveal,
    type RevealSpec,
    resolveReveal,
    splitFrame,
} from "../reveal/index.ts";
import type { Element } from "../schema/elements.ts";
import { moduleFor } from "../schema/elements.ts";
import type { Defaults, Screen } from "../schema/program.ts";
import { applyBreaks, type Break, lineBreaks } from "../text/breaks.ts";

/**
 * An element's lifecycle. Elements reveal in order, and the next starts when the current
 * one reaches Done.
 * - unloaded: waiting on an async resource (e.g. an image) before it can run
 * - ready:    waiting its turn; not rendered
 * - active:   revealing
 * - done:     fully revealed and, for interactive elements, usable
 */
export type ElementState = "unloaded" | "ready" | "active" | "done";

export type FrameListener = (frame: Frame) => void;

export interface ScreenRunOptions {
    defaults: Defaults;
    columns: number;
    /** Skip every reveal (e.g. for prefers-reduced-motion). */
    instant?: boolean;
    random?: Random;
    /** Called whenever an element changes state or the run finishes erasing. */
    onChange: () => void;
}

interface ElementRun {
    element: Element;
    state: ElementState;
    text: string;
    breaks: Break[];
    frame: Frame;
    listeners: Set<FrameListener>;
}

/**
 * Elements that reveal together. Usually one element; consecutive elements that inherit a
 * glitch reveal from their screen or the config form one block, as in the original effect.
 * A unit's reveal runs over its elements' texts joined by newlines.
 */
interface Unit {
    indices: number[];
    reveal: Reveal;
}

interface Eraser extends Unit {
    since: number;
}

let nextKey = 0;

/** One visit to a screen. Navigating back to the same screen creates a fresh run. */
export class ScreenRun {
    /** Unique per run, so a view can key on it. */
    readonly key = nextKey++;
    readonly screen: Screen;

    private readonly runs: ElementRun[];
    private readonly units: Unit[];
    private readonly random: Random | undefined;
    private readonly onChange: () => void;
    private active = -1;
    private activeSince = 0;
    private eraser: Eraser | null = null;
    private erasedFlag = false;
    private columns: number;
    private stateList: readonly ElementState[] = [];

    constructor(screen: Screen, options: ScreenRunOptions) {
        this.screen = screen;
        this.columns = options.columns;
        this.random = options.random;
        this.onChange = options.onChange;

        this.runs = screen.content.map((element) => {
            const text = moduleFor(element).text(element);
            return {
                element,
                state: "ready",
                text,
                breaks: lineBreaks(text, this.columns),
                frame: [],
                listeners: new Set(),
            };
        });
        this.units = this.buildUnits(options);
        this.snapshotStates();
    }

    get elements(): readonly Element[] {
        return this.screen.content;
    }

    /** Element states, as a new array whenever any of them changes. */
    get states(): readonly ElementState[] {
        return this.stateList;
    }

    /** True while revealing or erasing. */
    get animating(): boolean {
        return this.active !== -1 || this.eraser !== null;
    }

    /** True once {@link erase} has finished. */
    get erased(): boolean {
        return this.erasedFlag;
    }

    /** Activates the first element. */
    start(now: number): void {
        if (this.active !== -1 || this.eraser || this.runs[0]?.state !== "ready") return;
        this.activate(0, now);
        this.advance(now);
    }

    /**
     * Moves the animation to `now`. Units finish at their exact end time and the next one
     * starts from there, so timing is independent of the frame rate.
     */
    advance(now: number): void {
        if (this.eraser) {
            this.advanceEraser(now);
            return;
        }

        while (this.active !== -1) {
            const unit = this.units[this.active] as Unit;
            // a frame timestamp can predate the moment the unit was activated
            const elapsed = Math.max(0, now - this.activeSince);

            if (elapsed < unit.reveal.duration) {
                this.setUnitFrame(unit, unit.reveal.frame(elapsed));
                return;
            }

            const end = this.activeSince + unit.reveal.duration;
            this.finish(unit);
            this.activateNext(end);
        }
    }

    /** Completes every remaining element immediately. */
    skip(): void {
        if (this.active === -1 || this.eraser) return;
        for (const unit of this.units) {
            if (unit.indices.some((i) => this.runs[i]?.state !== "done")) this.finish(unit);
        }
        this.active = -1;
    }

    /**
     * Stops revealing and erases everything on screen with a reverse glitch, as one block.
     * Used when this screen is being navigated away from.
     */
    erase(now: number, duration: number): void {
        if (this.eraser || this.erasedFlag) return;
        this.active = -1;

        const indices = this.runs.flatMap((run, i) => (run.state === "ready" ? [] : [i]));
        const text = indices.map((i) => this.runs[i]?.text).join("\n");
        this.eraser = {
            indices,
            reveal: createGlitchReveal(text, { duration, reverse: true, random: this.random }),
            since: now,
        };
        this.advance(now);
    }

    setColumns(columns: number): void {
        if (columns === this.columns) return;
        this.columns = columns;
        for (const run of this.runs) {
            run.breaks = lineBreaks(run.text, columns);
            this.emitFrame(run);
        }
    }

    /** Receives the element's current frame immediately, then every change to it. */
    subscribeFrame(index: number, listener: FrameListener): () => void {
        const run = this.runs[index];
        if (!run) throw new RangeError(`No element at index ${index}`);
        run.listeners.add(listener);
        listener(applyBreaks(run.frame, run.breaks));
        return () => run.listeners.delete(listener);
    }

    private buildUnits({ defaults, instant, random }: ScreenRunOptions): Unit[] {
        const groups: { indices: number[]; spec: RevealSpec; block: boolean }[] = [];

        this.runs.forEach(({ element }, index) => {
            const { spec, inherited } = instant
                ? { spec: { type: "none" } as const, inherited: false }
                : resolveReveal(element.reveal, this.screen.reveal, defaults);
            const block = inherited && spec.type === "glitch";
            const last = groups.at(-1);

            if (block && last?.block) {
                last.indices.push(index);
            } else {
                groups.push({ indices: [index], spec, block });
            }
        });

        return groups.map(({ indices, spec }) => ({
            indices,
            reveal: createReveal(indices.map((i) => this.runs[i]?.text).join("\n"), spec, random),
        }));
    }

    private advanceEraser(now: number): void {
        const eraser = this.eraser as Eraser;
        const elapsed = Math.max(0, now - eraser.since);

        if (elapsed < eraser.reveal.duration) {
            this.setUnitFrame(eraser, eraser.reveal.frame(elapsed));
            return;
        }

        this.setUnitFrame(eraser, eraser.reveal.final());
        this.eraser = null;
        this.erasedFlag = true;
        this.onChange();
    }

    private activate(unitIndex: number, now: number): void {
        const unit = this.units[unitIndex] as Unit;
        this.setStates(unit, "active");
        this.active = unitIndex;
        this.activeSince = now;
    }

    private activateNext(now: number): void {
        const next = this.active + 1;
        this.active = -1;
        const unit = this.units[next];
        if (unit && this.runs[unit.indices[0] as number]?.state === "ready") {
            this.activate(next, now);
        }
    }

    private finish(unit: Unit): void {
        this.setUnitFrame(unit, unit.reveal.final());
        this.setStates(unit, "done");
    }

    private setStates(unit: Unit, state: ElementState): void {
        for (const i of unit.indices) (this.runs[i] as ElementRun).state = state;
        this.snapshotStates();
    }

    private setUnitFrame(unit: Unit, frame: Frame): void {
        const [only] = unit.indices;
        if (unit.indices.length === 1 && only !== undefined) {
            this.setFrame(this.runs[only] as ElementRun, frame);
            return;
        }

        const lengths = unit.indices.map((i) => this.runs[i]?.text.length ?? 0);
        splitFrame(frame, lengths).forEach((part, k) => {
            this.setFrame(this.runs[unit.indices[k] as number] as ElementRun, part);
        });
    }

    private setFrame(run: ElementRun, frame: Frame): void {
        if (sameFrame(frame, run.frame)) return;
        run.frame = frame;
        this.emitFrame(run);
    }

    private emitFrame(run: ElementRun): void {
        if (run.listeners.size === 0) return;
        const frame = applyBreaks(run.frame, run.breaks);
        for (const listener of run.listeners) listener(frame);
    }

    private snapshotStates(): void {
        this.stateList = this.runs.map((run) => run.state);
        this.onChange();
    }
}

function sameFrame(a: Frame, b: Frame): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    return a.every((segment, i) => segment.text === b[i]?.text && segment.kind === b[i]?.kind);
}
