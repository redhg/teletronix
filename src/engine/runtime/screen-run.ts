import { type ColumnsElement, columnLayout } from "../../modules/columns/definition.ts";
import { type SectionElement, sectionOpen } from "../../modules/section/definition.ts";
import { LOAD_FAILED } from "../module.ts";
import type { Random } from "../random.ts";
import {
    createGlitchReveal,
    createReveal,
    createTimedReveal,
    type Frame,
    type Reveal,
    type RevealSpec,
    resolveReveal,
    splitFrame,
} from "../reveal/index.ts";
import type { Action } from "../schema/common.ts";
import type { Element } from "../schema/elements.ts";
import { layoutOptions, moduleFor } from "../schema/elements.ts";
import { keyMatches } from "../schema/next.ts";
import type { Defaults, Screen } from "../schema/program.ts";
import type { Cue } from "../schema/sound.ts";
import type { Condition } from "../schema/variables.ts";
import { applyLayout, type Layout, layoutText } from "../text/layout.ts";

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
    /** An element's memory, kept by the terminal (see ModuleDefinition). */
    recall?: (elementId: string) => unknown;
    /** Whether a condition holds, for elements' `if`. Checked once, as the run starts. */
    holds?: (condition: Condition) => boolean;
    /** Fills variables into text. */
    format?: (text: string) => string;
    /** Skip every reveal (e.g. for prefers-reduced-motion). */
    instant?: boolean;
    random?: Random;
    /** Called synchronously whenever an element changes state or the run finishes erasing. */
    onChange: () => void;
    /** Called when something happens outside a tick or command (e.g. an image loads). */
    onWake?: () => void;
    /**
     * Called when an element finishes revealing, at the time it finished. Return true to
     * hold the rest of the screen until {@link ScreenRun.resume} (e.g. while an outcome
     * action is pending).
     */
    onFinished?: (element: Element, reveal: Reveal, time: number, run: ScreenRun) => boolean;
    /** Called once, when every element has finished revealing (or been skipped). */
    onDone?: (time: number) => void;
    /** Moments worth a sound (see Cue). */
    onCue?: (cue: Cue) => void;
}

interface ElementRun {
    element: Element;
    state: ElementState;
    text: string;
    layout: Layout;
    frame: Frame;
    progress: number;
    listeners: Set<FrameListener>;
    progressListeners: Set<ProgressListener>;
    /** What the element loaded, if it needed to (see ModuleDefinition.text). */
    loaded?: unknown;
}

/**
 * Elements that reveal together. Usually one element; consecutive elements that inherit a
 * glitch reveal from their screen or the config form one block, as in the original effect.
 * A unit's reveal runs over its elements' texts joined by newlines.
 */
interface Unit {
    indices: number[];
    reveal: Reveal;
    /** What its reveal was made from, to make it again when an element's text arrives. */
    spec?: RevealSpec;
    /** A module's own reveal, whose frames also set the element's text. */
    custom?: boolean;
    /** Which kind of reveal it is, for sound cues. */
    kind?: RevealSpec["type"];
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
    /** The screen's elements whose conditions held when the run started. */
    private readonly content: readonly Element[];
    private readonly runs: ElementRun[];
    private readonly units: Unit[];
    /** The unit being revealed, or -1. */
    private active = -1;
    private activeSince = 0;
    /** The unit waiting for its elements to load, or -1. */
    private waiting = -1;
    /** The unit to activate when a held screen resumes, or -1. */
    private held = -1;
    private finished: number | null = null;
    /**
     * The contents of open sections and of columns, each a run of its own, by the index of
     * the element that holds them.
     */
    private readonly children = new Map<number, ScreenRun>();
    /** A section whose contents the run is holding for while they reveal, or -1. */
    private waitingOn = -1;
    /** A pause element the reveal has stopped at, waiting for a key press or tap, or -1. */
    private pausedAt = -1;
    private eraser: Eraser | null = null;
    private erasedFlag = false;
    private columns: number;
    private stateList: readonly ElementState[] = [];

    constructor(screen: Screen, options: ScreenRunOptions) {
        this.screen = screen;
        this.options = options;
        this.columns = options.columns;
        this.content = screen.content.filter(
            (element) => !element.if || (options.holds?.(element.if) ?? true),
        );

        this.runs = this.content.map((element, index) => {
            const text = this.textOf(element);
            const loading = options.load?.(element);
            loading?.then(
                (value) => this.loaded(index, value),
                // a failed load still lets the screen go on; the element shows the failure
                () => this.loaded(index, LOAD_FAILED),
            );
            return {
                element,
                state: loading ? "unloaded" : "ready",
                text,
                layout: this.layout(element, text),
                frame: [],
                progress: 0,
                listeners: new Set(),
                progressListeners: new Set(),
            };
        });
        this.units = this.buildUnits();
        this.snapshotStates();
    }

    /** The elements on screen this visit: those whose `if` held when it started. */
    get elements(): readonly Element[] {
        return this.content;
    }

    /** Element states, as a new array whenever any of them changes. */
    get states(): readonly ElementState[] {
        return this.stateList;
    }

    /** True while revealing or erasing. */
    get animating(): boolean {
        return (
            this.active !== -1 ||
            this.eraser !== null ||
            [...this.children.values()].some((child) => child.animating)
        );
    }

    /**
     * Whether its controls can be used yet: always, or, if its screen waits for the whole
     * reveal (waitForReveal), once everything has been revealed.
     */
    get interactive(): boolean {
        const wait = this.screen.waitForReveal ?? this.options.defaults.waitForReveal;
        return !wait || this.finished !== null;
    }

    /** When every element finished revealing (or was skipped), or null if not yet. */
    get finishedAt(): number | null {
        return this.finished;
    }

    /** True once {@link erase} has finished. */
    get erased(): boolean {
        return this.erasedFlag;
    }

    /** The action of a usable element's hotkey (e.g. a button's), here or in its contents. */
    hotkey(key: string): Action | undefined {
        if (this.interactive) {
            for (const run of this.runs) {
                if (run.state !== "done") continue;
                const hotkeys = moduleFor(run.element).hotkeys?.(run.element) ?? [];
                const found = hotkeys.find((hotkey) => keyMatches([hotkey.key], key));
                if (found) return found.action;
            }
        }
        for (const child of this.children.values()) {
            const action = child.hotkey(key);
            if (action) return action;
        }
        return undefined;
    }

    /** Whether the reveal has stopped at a pause (here, or in an open section). */
    get paused(): boolean {
        return this.pausedAt !== -1 || [...this.children.values()].some((child) => child.paused);
    }

    /** Whether the reveal is waiting at this pause element. */
    pausedOn(elementId: string): boolean {
        return this.runs[this.pausedAt]?.element.id === elementId;
    }

    /** Carries on after a pause, at a key press or tap. */
    continue(now: number): void {
        if (this.pausedAt !== -1) {
            this.pausedAt = -1;
            this.options.onChange();
            this.resume(now);
            return;
        }
        for (const child of this.children.values()) {
            if (child.paused) {
                child.continue(now);
                return;
            }
        }
    }

    /** Characters per line. */
    get width(): number {
        return this.columns;
    }

    /** The run of an open section's (or columns') contents, once its turn has come. */
    contents(elementId: string): ScreenRun | null {
        const index = this.runs.findIndex((run) => run.element.id === elementId);
        return this.children.get(index) ?? null;
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
        for (const child of this.children.values()) child.advance(now);
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
            this.finishActive(unit, end);
        }
    }

    /**
     * Offers a key press to the element being revealed, which may interrupt it. Returns
     * whether it did. `key` is a KeyboardEvent.key value.
     */
    pressKey(key: string, now: number): boolean {
        this.advance(now);
        for (const child of this.children.values()) {
            if (child.pressKey(key, now)) return true;
        }
        const unit = this.units[this.active];
        const element = unit?.custom && this.runs[unit.indices[0] as number]?.element;
        if (!unit?.reveal.interrupt || !element) return false;
        if (!moduleFor(element).interruptKey?.(element, key)) return false;

        unit.reveal.interrupt(Math.max(0, now - this.activeSince));
        this.finishActive(unit, now);
        this.advance(now);
        return true;
    }

    /** Carries on revealing after a hold (see ScreenRunOptions.onFinished). */
    resume(now: number): void {
        if (this.held === -1 || this.eraser) return;
        const next = this.held;
        this.held = -1;
        this.tryActivate(next, now);
        this.advance(now);
    }

    /**
     * Completes the reveal immediately, including anything still loading and the contents
     * of open sections, up to the next pause: like the reveal, a skip stops there.
     */
    skip(now: number): void {
        if (this.eraser || this.erasedFlag || this.pausedAt !== -1) return;
        // the contents of a section the reveal is holding for come first
        if (this.waitingOn !== -1 && this.skipSection(this.waitingOn, now)) return;

        for (let u = 0; u < this.units.length; u++) {
            // (continuing after a section's contents can reach a pause of its own)
            if (this.pausedAt !== -1) return;
            const unit = this.units[u] as Unit;
            if (unit.indices.every((i) => this.runs[i]?.state === "done")) continue;
            this.active = -1;
            this.finish(unit, now);
            const stopped =
                this.pausedAt !== -1 ||
                (this.waitingOn !== -1 && this.skipSection(this.waitingOn, now));
            if (stopped) {
                this.waiting = -1;
                this.held = u + 1;
                return;
            }
        }
        this.active = -1;
        this.waiting = -1;
        this.held = -1;
        this.waitingOn = -1;
        // sections opened after the reveal
        for (const child of this.children.values()) child.skip(now);
        this.done(now);
    }

    /** Skips a section's contents. Returns whether they stopped at a pause. */
    private skipSection(index: number, now: number): boolean {
        const child = this.children.get(index);
        child?.skip(now);
        if (child?.paused) return true;
        this.waitingOn = -1;
        return false;
    }

    /**
     * Stops revealing and takes the screen away, when it's being navigated away from. A
     * glitch erases everything on screen as one block; a fade leaves the text alone for the
     * view to fade out. Either way the run is `erased` once `duration` has passed.
     */
    erase(now: number, { type, duration }: { type: "glitch" | "fade"; duration: number }): void {
        if (this.eraser || this.erasedFlag) return;
        for (const child of this.children.values()) child.erase(now, { type, duration });
        this.active = -1;
        this.waiting = -1;
        this.held = -1;

        if (type === "fade") {
            this.eraser = { indices: [], reveal: createTimedReveal(duration), since: now };
            this.advance(now);
            return;
        }

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
        if (indices.length > 0) this.options.onCue?.({ type: "glitch", duration });
        this.advance(now);
    }

    /** Re-reads every element's text, e.g. after a variable changed. */
    refreshAll(): void {
        for (const run of this.runs) this.refresh(run.element.id);
        for (const child of this.children.values()) child.refreshAll();
    }

    /** Re-reads an element's text, e.g. after its memory changed. */
    refresh(elementId: string): void {
        const index = this.runs.findIndex((r) => r.element.id === elementId);
        const run = this.runs[index];
        if (!run) {
            // an element in an open section
            for (const child of this.children.values()) child.refresh(elementId);
            return;
        }
        if (run.element.type === "section") this.syncSection(index);

        // a custom reveal draws the element itself, from its memory
        const unit = this.units.find((u) => u.custom && u.indices.includes(index));
        if (unit) {
            if (run.state === "done" && !this.eraser) {
                this.setUnitFrame(unit, unit.reveal.final(), 1);
            }
            return;
        }

        const text = this.textOf(run.element, run.loaded);
        if (text === run.text) return;

        run.text = text;
        run.layout = this.layout(run.element, text);
        if (run.state === "done") {
            run.frame = [{ kind: "visible", text }];
            this.emitFrame(run);
        }
    }

    setColumns(columns: number): void {
        if (columns === this.columns) return;
        this.columns = columns;
        for (const [index, child] of this.children) child.setColumns(this.contentColumns(index));
        for (const run of this.runs) {
            run.layout = this.layout(run.element, run.text);
            this.emitFrame(run);
        }
        // custom reveals may lay themselves out to the width, so redraw finished ones
        for (const unit of this.units) {
            const done = unit.indices.every((i) => this.runs[i]?.state === "done");
            if (unit.custom && done && !this.eraser)
                this.setUnitFrame(unit, unit.reveal.final(), 1);
        }
    }

    /** Receives the element's current frame immediately, then every change to it. */
    subscribeFrame(index: number, listener: FrameListener): () => void {
        const run = this.runAt(index);
        run.listeners.add(listener);
        listener(applyLayout(run.frame, run.layout), run.text);
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

    /** Marks the run finished revealing, once. */
    private done(now: number): void {
        if (this.finished !== null) return;
        this.finished = now;
        // (the view may be waiting for this to make the controls usable)
        this.options.onChange();
        this.options.onDone?.(now);
    }

    /** Whether an element's contents are showing: an open section's, or columns'. */
    private hasContents(element: Element): boolean {
        if (element.type === "columns") return true;
        return (
            element.type === "section" &&
            sectionOpen(element, this.options.recall?.(element.id) as boolean | undefined)
        );
    }

    /**
     * The characters per line an element's contents have: a section's, less its indent; a
     * column's width, for columns.
     */
    private contentColumns(index: number): number {
        const element = this.runs[index]?.element;
        if (element?.type === "columns") return columnLayout(element, this.columns).width;
        const indent = element?.type === "section" ? element.indent : 0;
        return Math.max(1, this.columns - indent);
    }

    /** Starts revealing an element's contents, as a run of their own. */
    private openContents(index: number, time: number): ScreenRun {
        const section = this.runs[index]?.element as SectionElement | ColumnsElement;
        const child: ScreenRun = new ScreenRun(
            {
                ...this.screen,
                // the element's reveal is its contents' default
                reveal: section.reveal ?? this.screen.reveal,
                next: undefined,
                sound: undefined,
                content: section.content,
            },
            {
                ...this.options,
                columns: this.contentColumns(index),
                onDone: (done) => {
                    if (this.waitingOn !== index || this.children.get(index) !== child) return;
                    this.waitingOn = -1;
                    this.resume(done);
                },
            },
        );
        this.children.set(index, child);
        child.start(time);
        this.options.onChange();
        return child;
    }

    /** After a section's header has been clicked: shows or hides its contents to match. */
    private syncSection(index: number): void {
        const run = this.runs[index];
        if (run?.element.type !== "section" || run.state !== "done" || this.eraser) return;
        const now = this.options.now();
        const open = this.hasContents(run.element);
        if (open && !this.children.has(index)) {
            this.openContents(index, now);
        } else if (!open && this.children.has(index)) {
            this.children.delete(index);
            this.options.onChange();
            // the screen may have been holding for the contents to finish revealing
            if (this.waitingOn === index) {
                this.waitingOn = -1;
                this.resume(now);
            }
        }
    }

    /** Where an element's text goes in the columns: its line breaks and alignment. */
    private layout(element: Element, text: string): Layout {
        const fallback = this.screen.align ?? this.options.defaults.align;
        return layoutText(text, this.columns, layoutOptions(element, fallback));
    }

    private textOf(element: Element, loaded?: unknown): string {
        const text = moduleFor(element).text(
            element,
            this.options.recall?.(element.id),
            this.options.format,
            loaded,
        );
        return this.options.format?.(text) ?? text;
    }

    private buildUnits(): Unit[] {
        const { defaults, instant, random } = this.options;
        const groups: { indices: number[]; reveal?: Reveal; spec: RevealSpec; block: boolean }[] =
            [];

        this.runs.forEach(({ element }, index) => {
            const { spec, inherited } = instant
                ? { spec: { type: "instant" } as const, inherited: false }
                : // an image's reveal is its own kind, which its module handles
                  resolveReveal(
                      element.type === "bitmap" ? undefined : element.reveal,
                      this.screen.reveal,
                      defaults,
                  );

            const context = {
                columns: () => this.columns,
                random,
                memory: () => this.options.recall?.(element.id),
                instant,
            };
            const custom = moduleFor(element).reveal?.(element, spec, context);
            if (custom) {
                groups.push({ indices: [index], reveal: custom, spec, block: false });
                return;
            }

            // sections and pauses hold the reveal where they are, so they stand alone
            const block =
                inherited &&
                spec.type === "glitch" &&
                element.type !== "section" &&
                element.type !== "columns" &&
                element.type !== "pause";
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
            custom: reveal !== undefined,
            // (a custom reveal may type too, e.g. a checklist's lines, so it keeps its kind)
            kind: spec.type,
            ...(reveal ? {} : { spec }),
        }));
    }

    private loaded(index: number, value: unknown): void {
        const run = this.runs[index];
        if (run?.state !== "unloaded") return;
        run.state = "ready";
        // what it loaded may be its text (e.g. a file's): lay it out, and reveal that
        run.loaded = value;
        const text = this.textOf(run.element, value);
        if (text !== run.text) {
            run.text = text;
            run.layout = this.layout(run.element, text);
            const unit = this.units.find((u) => u.indices.includes(index));
            if (unit?.spec) {
                const texts = unit.indices.map((i) => this.runs[i]?.text).join("\n");
                unit.reveal = createReveal(texts, unit.spec, this.options.random);
            }
        }
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
        if (!unit) {
            // past the last unit: the screen has finished revealing
            this.done(now);
            return;
        }

        if (unit.indices.some((i) => this.runs[i]?.state === "unloaded")) {
            this.waiting = unitIndex;
            return;
        }
        this.setStates(unit, "active");
        this.active = unitIndex;
        this.activeSince = now;
        for (const index of unit.indices) {
            const sound = this.runs[index]?.element.sound;
            if (sound) this.options.onCue?.({ type: "sound", name: sound });
        }
        if (unit.kind === "glitch" && !unit.custom) {
            this.options.onCue?.({ type: "glitch", duration: unit.reveal.duration });
        }
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

    /** Finishes the active unit at `time`, then moves on to the next unless held. */
    private finishActive(unit: Unit, time: number): void {
        const next = this.active + 1;
        const hold = this.finish(unit, time);
        this.active = -1;
        if (hold) {
            this.held = next;
        } else {
            this.tryActivate(next, time);
        }
    }

    /** Shows a unit's final frame and marks it Done. Returns whether to hold the screen. */
    private finish(unit: Unit, time: number): boolean {
        this.setUnitFrame(unit, unit.reveal.final(), 1);
        this.setStates(unit, "done");
        let hold = false;
        for (const index of unit.indices) {
            const element = this.runs[index]?.element;
            if (element && this.options.onFinished?.(element, unit.reveal, time, this)) hold = true;
            // a pause holds the reveal until a key press or tap (see continue)
            if (element?.type === "pause") {
                this.pausedAt = index;
                hold = true;
            }
            // an open section reveals its contents before the screen carries on
            if (element && this.hasContents(element) && !this.children.has(index)) {
                const child = this.openContents(index, time);
                if (child.finishedAt === null) {
                    this.waitingOn = index;
                    hold = true;
                }
            }
        }
        return hold;
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

        // a new character under a teletype cursor is a key press
        const typing =
            unit.kind === "teletype" && frame.some((segment) => segment.kind === "cursor");

        unit.indices.forEach((index, k) => {
            const run = this.runs[index] as ElementRun;
            const part = parts[k] ?? [];
            if (typing && !sameFrame(part, run.frame)) this.options.onCue?.({ type: "key" });
            if (unit.custom) {
                // a custom reveal's frames are the element's text (e.g. a progress bar)
                const text = part.map((segment) => segment.text).join("");
                if (text !== run.text) {
                    run.text = text;
                    run.layout = this.layout(run.element, text);
                }
            }
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
        const frame = applyLayout(run.frame, run.layout);
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
