import { createReveal, type Frame, type Reveal } from "../reveal/index.ts";
import type { Element } from "../schema/elements.ts";
import { moduleFor } from "../schema/elements.ts";
import type { Defaults, Screen } from "../schema/program.ts";
import { applyBreaks, type Break, lineBreaks } from "../text/breaks.ts";

/**
 * An element's lifecycle. One element is Active at a time, and the next is activated
 * when the current one reaches Done.
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
    /** Called whenever an element changes state. */
    onChange: () => void;
}

interface ElementRun {
    element: Element;
    state: ElementState;
    reveal: Reveal;
    breaks: Break[];
    frame: Frame;
    listeners: Set<FrameListener>;
}

let nextKey = 0;

/** One visit to a screen. Navigating back to the same screen creates a fresh run. */
export class ScreenRun {
    /** Unique per run, so a view can key on it. */
    readonly key = nextKey++;
    readonly screen: Screen;

    private readonly runs: ElementRun[];
    private readonly onChange: () => void;
    private active = -1;
    private activeSince = 0;
    private columns: number;
    private stateList: readonly ElementState[] = [];

    constructor(screen: Screen, options: ScreenRunOptions) {
        this.screen = screen;
        this.columns = options.columns;
        this.onChange = options.onChange;

        this.runs = screen.content.map((element) => {
            const text = moduleFor(element).text(element);
            const reveal = options.instant
                ? createReveal(text, [{ type: "none" }], options.defaults)
                : createReveal(text, [element.reveal, screen.reveal], options.defaults);
            return {
                element,
                state: "ready",
                reveal,
                breaks: lineBreaks(text, this.columns),
                frame: reveal.frame(0),
                listeners: new Set(),
            };
        });
        this.snapshotStates();
    }

    get elements(): readonly Element[] {
        return this.screen.content;
    }

    /** Element states, as a new array whenever any of them changes. */
    get states(): readonly ElementState[] {
        return this.stateList;
    }

    /** True while an element is still revealing. */
    get animating(): boolean {
        return this.active !== -1;
    }

    /** Activates the first element. */
    start(now: number): void {
        if (this.active !== -1 || this.runs[0]?.state !== "ready") return;
        this.activate(0, now);
        this.advance(now);
    }

    /**
     * Moves the active reveal to `now`. Elements finish at their exact end time and the
     * next one starts from there, so timing is independent of the frame rate.
     */
    advance(now: number): void {
        while (this.active !== -1) {
            const run = this.runs[this.active] as ElementRun;
            // a frame timestamp can predate the moment the element was activated
            const elapsed = Math.max(0, now - this.activeSince);

            if (elapsed < run.reveal.duration) {
                this.setFrame(run, run.reveal.frame(elapsed));
                return;
            }

            const end = this.activeSince + run.reveal.duration;
            this.finish(run);
            this.activateNext(end);
        }
    }

    /** Completes every remaining element immediately. */
    skip(): void {
        if (this.active === -1) return;
        for (const run of this.runs) {
            if (run.state !== "done") this.finish(run);
        }
        this.active = -1;
        this.snapshotStates();
    }

    setColumns(columns: number): void {
        if (columns === this.columns) return;
        this.columns = columns;
        for (const run of this.runs) {
            run.breaks = lineBreaks(moduleFor(run.element).text(run.element), columns);
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

    private activate(index: number, now: number): void {
        const run = this.runs[index] as ElementRun;
        run.state = "active";
        this.active = index;
        this.activeSince = now;
        this.snapshotStates();
    }

    private activateNext(now: number): void {
        const index = this.active + 1;
        this.active = -1;
        if (this.runs[index]?.state === "ready") {
            this.activate(index, now);
        }
    }

    private finish(run: ElementRun): void {
        run.state = "done";
        this.setFrame(run, run.reveal.final());
        this.snapshotStates();
    }

    private setFrame(run: ElementRun, frame: Frame): void {
        if (frame === run.frame) return;
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
