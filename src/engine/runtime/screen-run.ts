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

/** Receives an element's frame, and its full current text (e.g. for screen readers). */
export type FrameListener = (frame: Frame, text: string) => void;
/** Receives an element's reveal progress: 0 to 1 while revealing, 1 to 0 while erasing. */
export type ProgressListener = (progress: number) => void;

export interface ScreenRunOptions {
    defaults: Defaults;
    columns: number;
    /** The current time, for elements that finish loading between ticks. */
    now: () => number;
    /** Starts loading anything an element needs. Returns nothing if it needs nothing. */
    load?: (element: Element) => Promise<unknown> | undefined;
    /** Per-element memory kept by the terminal (see ModuleDefinition). */
    memory?: ReadonlyMap<string, unknown>;
    /** Skip every reveal (e.g. for prefers-reduced-motion). */
    instant?: boolean;
    random?: Random;
    /** Called synchronously whenever an element changes state or the run finishes erasing. */
    onChange: () => void;
    /** Called when something happens outside a tick or command (e.g. an image loads). */
    onWake?: () => void;
}

interface ElementRun {
    element: Element;
    state: ElementState;
    text: string;
    breaks: Break[];
    frame: Frame;
    progress: number;
    listeners: Set<FrameListener>;
    progressListeners: Set<ProgressListener>;
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

    private readonly options: ScreenRunOptions;
    private readonly runs: ElementRun[];
    private readonly units: Unit[];
    /** The unit being revealed, or -1. */
    private active = -1;
    private activeSince = 0;
    /** The unit waiting for its elements to load, or -1. */
    private waiting = -1;
    private eraser: Eraser | null = null;
    private erasedFlag = false;
    private columns: number;
    private stateList: readonly ElementState[] = [];

    constructor(screen: Screen, options: ScreenRunOptions) {
        this.screen = screen;
        this.options = options;
        this.columns = options.columns;

        this.runs = screen.content.map((element, index) => {
            const text = this.textOf(element);
            const loading = options.load?.(element);
            loading?.then(
                () => this.loaded(index),
                // a failed load still lets the screen go on; the view shows the failure
                () => this.loaded(index),
            );
            return {
                element,
                state: loading ? "unloaded" : "ready",
                text,
                breaks: lineBreaks(text, this.columns),
                frame: [],
                progress: 0,
                listeners: new Set(),
                progressListeners: new Set(),
            };
        });
        this.units = this.buildUnits();
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
        if (this.active !== -1 || this.waiting !== -1 || this.eraser) return;
        if (this.runs.some((run) => run.state === "active" || run.state === "done")) return;
        this.tryActivate(0, now);
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
                this.setUnitFrame(unit, unit.reveal.frame(elapsed), elapsed / unit.reveal.duration);
                return;
            }

            const end = this.activeSince + unit.reveal.duration;
            const next = this.active + 1;
            this.finish(unit);
            this.active = -1;
            this.tryActivate(next, end);
        }
    }

    /** Completes every remaining element immediately, including any still loading. */
    skip(): void {
        if (this.eraser || this.erasedFlag) return;
        for (const unit of this.units) {
            if (unit.indices.some((i) => this.runs[i]?.state !== "done")) this.finish(unit);
        }
        this.active = -1;
        this.waiting = -1;
    }

    /**
     * Stops revealing and erases everything on screen with a reverse glitch, as one block.
     * Used when this screen is being navigated away from.
     */
    erase(now: number, duration: number): void {
        if (this.eraser || this.erasedFlag) return;
        this.active = -1;
        this.waiting = -1;

        const shown = (run: ElementRun) => run.state === "active" || run.state === "done";
        const indices = this.runs.flatMap((run, i) => (shown(run) ? [i] : []));
        const text = indices.map((i) => this.runs[i]?.text).join("\n");
        this.eraser = {
            indices,
            reveal: createGlitchReveal(text, {
                duration,
                reverse: true,
                random: this.options.random,
            }),
            since: now,
        };
        this.advance(now);
    }

    /** Re-reads an element's text, e.g. after its memory changed. */
    refresh(elementId: string): void {
        const run = this.runs.find((r) => r.element.id === elementId);
        if (!run) return;
        const text = this.textOf(run.element);
        if (text === run.text) return;

        run.text = text;
        run.breaks = lineBreaks(text, this.columns);
        if (run.state === "done") {
            run.frame = [{ kind: "visible", text }];
            this.emitFrame(run);
        }
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
        const run = this.runAt(index);
        run.listeners.add(listener);
        listener(applyBreaks(run.frame, run.breaks), run.text);
        return () => run.listeners.delete(listener);
    }

    /** Receives the element's current progress immediately, then every change to it. */
    subscribeProgress(index: number, listener: ProgressListener): () => void {
        const run = this.runAt(index);
        run.progressListeners.add(listener);
        listener(run.progress);
        return () => run.progressListeners.delete(listener);
    }

    private runAt(index: number): ElementRun {
        const run = this.runs[index];
        if (!run) throw new RangeError(`No element at index ${index}`);
        return run;
    }

    private textOf(element: Element): string {
        return moduleFor(element).text(element, this.options.memory?.get(element.id));
    }

    private buildUnits(): Unit[] {
        const { defaults, instant, random } = this.options;
        const groups: { indices: number[]; reveal?: Reveal; spec: RevealSpec; block: boolean }[] =
            [];

        this.runs.forEach(({ element }, index) => {
            const { spec, inherited } = instant
                ? { spec: { type: "none" } as const, inherited: false }
                : resolveReveal(element.reveal, this.screen.reveal, defaults);

            const custom = moduleFor(element).reveal?.(element, spec);
            if (custom) {
                groups.push({ indices: [index], reveal: custom, spec, block: false });
                return;
            }

            const block = inherited && spec.type === "glitch";
            const last = groups.at(-1);
            if (block && last?.block) {
                last.indices.push(index);
            } else {
                groups.push({ indices: [index], spec, block });
            }
        });

        return groups.map(({ indices, reveal, spec }) => ({
            indices,
            reveal:
                reveal ??
                createReveal(indices.map((i) => this.runs[i]?.text).join("\n"), spec, random),
        }));
    }

    private loaded(index: number): void {
        const run = this.runs[index];
        if (run?.state !== "unloaded") return;
        run.state = "ready";
        this.snapshotStates();

        if (this.waiting !== -1 && !this.eraser) {
            const now = this.options.now();
            this.tryActivate(this.waiting, now);
            this.advance(now);
        }
        this.options.onWake?.();
    }

    /** Activates a unit if its elements are loaded, or waits for them. */
    private tryActivate(unitIndex: number, now: number): void {
        const unit = this.units[unitIndex];
        this.waiting = -1;
        if (!unit) return;

        if (unit.indices.some((i) => this.runs[i]?.state === "unloaded")) {
            this.waiting = unitIndex;
            return;
        }
        this.setStates(unit, "active");
        this.active = unitIndex;
        this.activeSince = now;
    }

    private advanceEraser(now: number): void {
        const eraser = this.eraser as Eraser;
        const elapsed = Math.max(0, now - eraser.since);

        if (elapsed < eraser.reveal.duration) {
            this.setUnitFrame(
                eraser,
                eraser.reveal.frame(elapsed),
                1 - elapsed / eraser.reveal.duration,
            );
            return;
        }

        this.setUnitFrame(eraser, eraser.reveal.final(), 0);
        this.eraser = null;
        this.erasedFlag = true;
        this.options.onChange();
    }

    private finish(unit: Unit): void {
        this.setUnitFrame(unit, unit.reveal.final(), 1);
        this.setStates(unit, "done");
    }

    private setStates(unit: Unit, state: ElementState): void {
        for (const i of unit.indices) (this.runs[i] as ElementRun).state = state;
        this.snapshotStates();
    }

    private setUnitFrame(unit: Unit, frame: Frame, progress: number): void {
        const parts =
            unit.indices.length === 1
                ? [frame]
                : splitFrame(
                      frame,
                      unit.indices.map((i) => this.runs[i]?.text.length ?? 0),
                  );

        unit.indices.forEach((index, k) => {
            const run = this.runs[index] as ElementRun;
            const part = parts[k] ?? [];
            if (!sameFrame(part, run.frame)) {
                run.frame = part;
                this.emitFrame(run);
            }
            if (progress !== run.progress) {
                run.progress = progress;
                for (const listener of run.progressListeners) listener(progress);
            }
        });
    }

    private emitFrame(run: ElementRun): void {
        if (run.listeners.size === 0) return;
        const frame = applyBreaks(run.frame, run.breaks);
        for (const listener of run.listeners) listener(frame, run.text);
    }

    private snapshotStates(): void {
        this.stateList = this.runs.map((run) => run.state);
        this.options.onChange();
    }
}

function sameFrame(a: Frame, b: Frame): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    return a.every((segment, i) => segment.text === b[i]?.text && segment.kind === b[i]?.kind);
}
