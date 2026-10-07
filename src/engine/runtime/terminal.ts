import { ownClock } from "../../modules/timer/definition.ts";
import type { Random } from "../random.ts";
import type { Reveal } from "../reveal/index.ts";
import { resolveTransition, type TransitionSpec } from "../reveal/index.ts";
import type { Action, ActionCase } from "../schema/common.ts";
import { type Dialog, DialogSchema, dialogAction } from "../schema/dialog.ts";
import { type EffectsSetting, type ResolvedEffects, resolveEffects } from "../schema/effects.ts";
import type { Element } from "../schema/elements.ts";
import { boundVariable, forEachElement, moduleFor } from "../schema/elements.ts";
import {
    firstTimedRule,
    keyMatches,
    type NextRule,
    ruleForKey,
    ruleForTap,
} from "../schema/next.ts";
import { ambienceOf, type Program } from "../schema/program.ts";
import type { Cue } from "../schema/sound.ts";
import { type Clock, countsDown, formatTime, shownSeconds } from "../schema/timers.ts";
import { assign, type Condition, format, holds, type VariableValue } from "../schema/variables.ts";
import type { Ticker } from "../time/ticker.ts";
import { type ElementState, ScreenRun } from "./screen-run.ts";

export interface TerminalOptions {
    program: Program;
    ticker: Ticker;
    /** Characters per line. The UI measures this and keeps it current via setColumns(). */
    columns?: number;
    /** Show everything instantly (e.g. for prefers-reduced-motion). */
    instant?: boolean;
    /**
     * The screen to start on, instead of the program's start screen (and a saved game's), e.g.
     * from the page's address. Ignored if the program has no such screen.
     */
    startAt?: string;
    /** Randomness for effects. Defaults to Math.random. */
    random?: Random;
    /**
     * Starts loading anything an element needs before it can be revealed (e.g. an image),
     * or returns nothing. The element stays Unloaded, and its screen waits at it, until
     * the promise settles.
     */
    load?: (element: Element) => Promise<unknown> | undefined;
}

export interface ScreenSnapshot {
    run: ScreenRun;
    states: readonly ElementState[];
}

export interface OutgoingSnapshot extends ScreenSnapshot {
    /** How it's leaving, so the view can animate it. */
    transition: Extract<TransitionSpec, { type: "glitch" | "fade" }>;
}

/** Something shown between screens, before the next one starts (e.g. a burst of static). */
export interface Interstitial {
    type: "static";
}

/** Structural state for the UI. A new object whenever anything in it changes. */
export interface TerminalSnapshot {
    screen: ScreenSnapshot | null;
    /** The previous screen, while it erases itself over the current one. */
    outgoing: OutgoingSnapshot | null;
    /** Shown between screens; the current screen starts revealing once it's gone. */
    interstitial: Interstitial | null;
    dialog: Dialog | null;
    /** The effects that are on for the current screen. */
    effects: ResolvedEffects;
    /** Changes whenever a variable does, for views that show them (e.g. the bars). */
    variables: number;
    /** The audio file to loop in the background now, by its name in the program's sounds. */
    ambience: string | null;
}

const DEFAULT_COLUMNS = 80;
/** The most screens going back can go back through. */
const HISTORY = 50;

/**
 * The engine's root. Owns navigation, dialogs and timing.
 *
 * The UI reads structural changes through subscribe()/getSnapshot() (low frequency) and
 * per-frame text through ScreenRun.subscribeFrame() (every animation frame), so a
 * framework never has to re-render just because text is revealing.
 */
export class Terminal {
    readonly program: Program;

    private readonly ticker: Ticker;
    private readonly instant: boolean;
    private readonly random: Random | undefined;
    private readonly load: TerminalOptions["load"];
    private readonly startAt: string | undefined;
    /** Per-element state that outlives a screen visit (see ModuleDefinition). */
    private readonly memory = new Map<string, unknown>();
    /** The program's variables, from their starting values. */
    private readonly variables: Map<string, VariableValue>;
    /** Every element in the program, by id. */
    private readonly elements = new Map<string, Element>();
    /**
     * The program's timers, by name, and timer elements' own, by "@" and their element's id
     * (those only last while their screen does).
     */
    private readonly timers = new Map<string, TimerState>();
    private readonly listeners = new Set<() => void>();
    private readonly cueListeners = new Set<(cue: Cue) => void>();
    private columns: number;
    private run: ScreenRun | null = null;
    private previous = "";
    /** A saved game's screen, to start on instead of the start screen (see restoreState). */
    private resumeAt: string | null = null;
    /** The screens before this one, for going back: the most recent last. */
    private history: string[] = [];
    private outgoing: ScreenRun | null = null;
    private outgoingTransition: OutgoingSnapshot["transition"] | null = null;
    private interstitial: { type: "static"; until: number } | null = null;
    /** Set once the current screen's `next` has fired, so it fires only once per visit. */
    private nextFired = false;
    /** Element outcomes waiting to run, for the current screen (see ModuleDefinition.outcome). */
    private outcomes: { run: ScreenRun; holder: ScreenRun; action: Action; due: number }[] = [];
    private dialog: Dialog | null = null;
    /** Resolved once per screen, so effect views see the same object on every visit. */
    private readonly effects = new Map<string, ResolvedEffects>();
    /** Effects laid over the program's and screen's (see setRemoteEffects). */
    private remoteEffects: EffectsSetting | undefined;
    /** Ambience laid over the program's and screen's (see setRemoteAmbience). */
    private remoteAmbience: string | false | undefined;
    /** The program-wide effects: the config's, unless replaced with setEffects(). */
    private configEffects: EffectsSetting | undefined;
    /** The theme's effects, under the program's */
    private themeEffects: EffectsSetting | undefined;
    private snapshot: TerminalSnapshot = {
        screen: null,
        outgoing: null,
        interstitial: null,
        dialog: null,
        effects: {},
        variables: 0,
        ambience: null,
    };
    private variablesVersion = 0;
    private dirty = false;
    private unsubscribeTicker: (() => void) | null = null;

    constructor(options: TerminalOptions) {
        this.program = options.program;
        this.ticker = options.ticker;
        this.columns = options.columns ?? DEFAULT_COLUMNS;
        this.instant = options.instant ?? false;
        this.random = options.random;
        this.load = options.load;
        this.startAt =
            options.startAt !== undefined && options.program.screens.has(options.startAt)
                ? options.startAt
                : undefined;
        this.configEffects = options.program.effects;
        this.themeEffects = options.program.themeEffects;
        this.variables = new Map(options.program.variables);
        for (const screen of options.program.screens.values()) {
            forEachElement(screen.content, (element) => this.elements.set(element.id, element));
        }
        this.resetTimers();
    }

    // ─── Store interface (e.g. for React's useSyncExternalStore) ────────────

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getSnapshot = (): TerminalSnapshot => this.snapshot;

    /** Receives moments worth a sound, as they happen (see Cue). */
    subscribeCues(listener: (cue: Cue) => void): () => void {
        this.cueListeners.add(listener);
        return () => this.cueListeners.delete(listener);
    }

    // ─── Commands ───────────────────────────────────────────────────────────

    /** Shows the start screen, and starts the timers that start with the program. */
    start(): void {
        // (a restored game's timers are as they were saved)
        if (this.resumeAt === null) this.startTimers();
        const screen = this.startAt ?? this.resumeAt ?? this.program.start;
        this.resumeAt = null;
        this.navigate(screen);
    }

    /**
     * Where the program is, to save and carry on from later: the screen, the variables, the
     * program's timers, and every element's memory. Plain data, for JSON.
     */
    saveState(): SavedState {
        const now = this.ticker.now();
        const timers: SavedState["timers"] = {};
        for (const name of this.program.timers.keys()) {
            const timer = this.timers.get(name);
            if (timer) timers[name] = { ms: timerMs(timer, now), running: timer.running };
        }
        return {
            version: 1,
            screen: this.run?.screen.id ?? this.program.start,
            variables: Object.fromEntries(this.variables),
            memory: Object.fromEntries(this.memory),
            timers,
            history: [...this.history],
        };
    }

    /**
     * Carries on from a saved state (see saveState), before start(): anything in it the
     * program no longer has (a screen, a variable, an element) is left as the program starts.
     */
    restoreState(state: unknown): void {
        if (!isSavedState(state)) return;
        for (const [name, value] of Object.entries(state.variables)) {
            const initial = this.program.variables.get(name);
            if (initial !== undefined && typeof value === typeof initial) {
                this.variables.set(name, value);
            }
        }
        for (const [id, value] of Object.entries(state.memory)) {
            if (this.elements.has(id)) this.memory.set(id, value);
        }
        const now = this.ticker.now();
        for (const [name, saved] of Object.entries(state.timers)) {
            const timer = this.timers.get(name);
            if (!timer || typeof saved?.ms !== "number") continue;
            const [low, high] = [timer.clock.from, timer.clock.to].sort((a, b) => a - b);
            timer.ms = Math.min((high ?? 0) * 1000, Math.max((low ?? 0) * 1000, saved.ms));
            timer.running = saved.running === true;
            timer.since = now;
        }
        this.variablesVersion++;
        if (this.program.screens.has(state.screen)) this.resumeAt = state.screen;
        if (Array.isArray(state.history)) {
            this.history = state.history
                .filter(
                    (id): id is string => typeof id === "string" && this.program.screens.has(id),
                )
                .slice(-HISTORY);
        }
    }

    /**
     * Runs an action: its first case whose condition holds changes variables, plays a
     * sound, then goes to a screen or opens a dialog. Returns the case that ran, if any.
     */
    dispatch(action: Action): ActionCase | undefined {
        const chosen = action.find((choice) => !choice.if || this.holds(choice.if));
        if (!chosen) return undefined;
        if (chosen.restart) {
            if (chosen.sound) this.cue({ type: "sound", name: chosen.sound });
            this.restart();
            this.flush();
            return chosen;
        }
        if (chosen.set) {
            for (const assignment of chosen.set) {
                const current = this.variables.get(assignment.variable);
                this.variables.set(
                    assignment.variable,
                    assign(assignment, current, this.random ?? Math.random),
                );
            }
            this.variablesChanged();
            // a timed `next` rule may apply now
            this.syncTicker();
        }
        if (chosen.startTimer || chosen.stopTimer || chosen.resetTimer) {
            const now = this.ticker.now();
            if (chosen.stopTimer) this.stopTimer(chosen.stopTimer, now);
            if (chosen.resetTimer) this.resetTimer(chosen.resetTimer);
            if (chosen.startTimer) this.startTimer(chosen.startTimer, now);
            this.variablesChanged();
            this.syncTicker();
        }
        if (chosen.sound) this.cue({ type: "sound", name: chosen.sound });
        // a list of screens (or dialogs) is one of them, at random
        const one = (ids: string | string[]) =>
            typeof ids === "string"
                ? ids
                : (ids[Math.floor((this.random ?? Math.random)() * ids.length)] ?? ids[0] ?? "");
        const frame = chosen.frame === undefined ? undefined : this.frameNamed(chosen.frame);
        if (chosen.back) this.goBack();
        else if (frame && chosen.screen !== undefined) this.showInFrame(frame, one(chosen.screen));
        else if (chosen.screen !== undefined) this.navigate(one(chosen.screen));
        else if (chosen.dialog !== undefined) this.openDialog(one(chosen.dialog));
        this.flush();
        return chosen;
    }

    /** The frame on the current screen with this name, if there is one. */
    private frameNamed(name: string): string | undefined {
        let found: string | undefined;
        if (this.run) {
            forEachElement(this.run.screen.content, (element) => {
                if (found === undefined && element.type === "frame" && element.name === name) {
                    found = element.id;
                }
            });
        }
        return found;
    }

    /**
     * The screen a frame on the current screen is showing, by the frame's name: one a link
     * put there, or its own to begin with. Undefined if there's no such frame.
     */
    frameShowing(name: string): string | undefined {
        const frameId = this.frameNamed(name);
        const frame = frameId === undefined ? undefined : this.elements.get(frameId);
        if (frame?.type !== "frame") return undefined;
        return this.recall<string>(frame.id) ?? frame.screen;
    }

    /** Shows a screen's content in a frame on the current screen, in place of what was there. */
    private showInFrame(frameId: string, screenId: string): void {
        const screen = this.program.screens.get(screenId);
        if (!screen) throw new Error(`Unknown screen "${screenId}"`);
        if (screen.sound) this.cue({ type: "sound", name: screen.sound });
        this.remember(frameId, screenId);
    }

    /** A variable's current value, or a timer's, in whole seconds. */
    variable(name: string): VariableValue | undefined {
        const timer = this.timers.get(name);
        return this.variables.get(name) ?? (timer && shownSeconds(timer.clock, timer.ms));
    }

    /** Whether a condition holds, with the variables as they are now. */
    holds = (condition: Condition): boolean => holds(condition, (name) => this.variable(name));

    /** Text with {name} replaced by the variable's value. */
    format = (text: string): string =>
        format(text, (name) => {
            const timer = this.timers.get(name);
            return timer ? formatTime(timer.clock, timer.ms) : this.variables.get(name);
        });

    /**
     * Shows a screen from the top. Navigating to the current screen replays it.
     *
     * With a glitch or fade transition, the current screen stays on screen and erases (or
     * fades) itself over the new one while the new one starts revealing, and is dropped
     * once that's finished.
     */
    navigate(screenId: string, remember = true): void {
        const screen = this.program.screens.get(screenId);
        if (!screen) throw new Error(`Unknown screen "${screenId}"`);
        // where it came from, for going back (not when it's coming back). A link to the screen
        // it just came from, e.g. a "> BACK" written as { "screen": "menu" }, is going back
        // too: otherwise the menu's own back would return here.
        const from = this.run?.screen.id;
        if (remember && from !== undefined && from !== screenId) {
            if (this.history.at(-1) === screenId) {
                this.history.pop();
            } else {
                this.history.push(from);
                if (this.history.length > HISTORY) this.history.shift();
            }
        }
        const now = this.ticker.now();
        this.dialog = null;
        this.nextFired = false;
        this.outcomes = [];
        // timer elements' own timers go with their screen
        for (const key of [...this.timers.keys()]) {
            if (key.startsWith("@")) this.timers.delete(key);
        }

        this.previous = this.run?.text ?? "";
        const transition = resolveTransition(screen.transition, this.program.defaults);
        // a transition that's still playing is cut short by the next one
        this.outgoing = null;
        this.interstitial = null;
        const animated = this.run !== null && !this.instant;
        if (animated && (transition.type === "glitch" || transition.type === "fade")) {
            this.outgoing = this.run;
            this.outgoingTransition = transition;
            this.outgoing?.erase(now, transition);
        } else if (animated && transition.type === "static") {
            // the old screen goes at once; the new one waits for the static to pass
            this.interstitial = { type: "static", until: now + transition.duration };
            this.cue({ type: "static", duration: transition.duration });
        }

        const run: ScreenRun = new ScreenRun(screen, {
            defaults: this.program.defaults,
            columns: this.columns,
            instant: this.instant,
            now: () => this.ticker.now(),
            load: this.load,
            recall: (elementId) => this.recall(elementId),
            holds: this.holds,
            format: this.format,
            screen: (screenId) => this.program.screens.get(screenId),
            random: this.random,
            onChange: this.markDirty,
            onWake: this.wake,
            onFinished: (element, reveal, time, holder) =>
                this.elementFinished(run, holder, element, reveal, time),
            onCue: this.cue,
        });
        this.run = run;
        if (screen.sound) this.cue({ type: "sound", name: screen.sound });
        if (!this.interstitial) this.run.start(now);
        this.markDirty();
        this.settle();
    }

    /**
     * Starts the program over, as if just loaded: the start screen, with the variables and
     * every element's memory back where they began.
     */
    /** Goes back to the screen before this one, if there was one. */
    goBack(): void {
        const previous = this.history.pop();
        if (previous !== undefined && this.program.screens.has(previous)) {
            this.navigate(previous, false);
        }
    }

    restart(): void {
        this.resumeAt = null;
        this.history = [];
        this.memory.clear();
        this.variables.clear();
        for (const [name, value] of this.program.variables) this.variables.set(name, value);
        this.variablesVersion++;
        this.resetTimers();
        this.startTimers();
        // no transition from whatever was on screen
        this.run = null;
        this.outgoing = null;
        this.navigate(this.program.start);
    }

    openDialog(dialogId: string): void {
        const dialog = this.program.dialogs.get(dialogId);
        if (!dialog) throw new Error(`Unknown dialog "${dialogId}"`);
        this.dialog = dialog;
        const alert = (dialog.className ?? "").split(/\s+/).includes("alert");
        this.cue(dialog.sound ? { type: "sound", name: dialog.sound } : { type: "dialog", alert });
        this.markDirty();
        this.flush();
    }

    /**
     * Closes the open dialog with an answer: confirmed (yes, OK) or not (no, dismissed),
     * then runs the action for that answer, if the dialog has one.
     */
    answerDialog(confirmed: boolean): void {
        const dialog = this.dialog;
        if (!dialog) return;
        this.dialog = null;
        this.markDirty();

        const action = dialogAction(dialog, confirmed);
        if (action) this.dispatch(action);
        this.flush();
    }

    /**
     * Effects laid over everything else's, e.g. from a GM's remote control: on or off
     * whatever the program and screen say. Undefined clears them.
     */
    setRemoteEffects(effects: EffectsSetting | undefined): void {
        this.remoteEffects = effects;
        this.effects.clear();
        this.markDirty();
        this.flush();
    }

    /**
     * Ambience over what the program and screen say, e.g. from a GM's remote control: an audio
     * file from the program's sounds, or false for silence. Undefined clears it.
     */
    setRemoteAmbience(ambience: string | false | undefined): void {
        if (typeof ambience === "string" && !this.program.audio.has(ambience)) return;
        this.remoteAmbience = ambience;
        this.markDirty();
        this.flush();
    }

    /**
     * Shows a message in a dialog that isn't in the program, e.g. one a GM types: like an
     * alert, with an OK button.
     */
    transmit(content: string, options: { dismiss?: string; className?: string } = {}): void {
        this.dialog = {
            ...DialogSchema.parse({ type: "alert", content: content.split("\n"), ...options }),
            id: "@transmission",
        };
        this.cue({ type: "dialog", alert: (options.className ?? "").includes("alert") });
        this.markDirty();
        this.flush();
    }

    /** Whether a timer is running (rather than stopped, or never started). */
    timerRunning(name: string): boolean {
        return this.timers.get(name)?.running ?? false;
    }

    /**
     * Replaces the program-wide effects, and its theme's, e.g. while trying out settings in a
     * preview.
     */
    setEffects(effects: EffectsSetting | undefined, theme?: EffectsSetting): void {
        this.configEffects = effects;
        this.themeEffects = theme;
        this.effects.clear();
        this.markDirty();
        this.flush();
    }

    /** Reads an element's memory: its variable, if it's bound to one. */
    recall<M>(elementId: string): M | undefined {
        const element = this.elements.get(elementId);
        // an element that shows a variable or timer has its value
        const source = element && moduleFor(element).source?.(element);
        if (source !== undefined) return this.variable(source) as M | undefined;
        // a timer element shows its timer's time
        if (element?.type === "timer") {
            const timer = this.timers.get(element.timer ?? `@${element.id}`);
            return (timer && formatTime(timer.clock, timer.ms)) as M | undefined;
        }
        const variable = element && boundVariable(element);
        const value = variable === undefined ? undefined : this.variables.get(variable);
        if (element && value !== undefined) {
            return moduleFor(element).binding?.read(element, value) as M | undefined;
        }
        const multi = element && moduleFor(element).multiBinding;
        const names = element && multi ? multi.variables(element) : [];
        if (element && multi && names.some((name) => name !== null)) {
            const values = names.map((name) =>
                name === null ? undefined : this.variables.get(name),
            );
            return multi.read(element, values, this.memory.get(elementId)) as M;
        }
        return this.memory.get(elementId) as M | undefined;
    }

    /**
     * Updates an element's memory (or the variable it's bound to), and what's on screen
     * that depends on it.
     */
    remember(elementId: string, value: unknown): void {
        const before = this.recall(elementId);
        const element = this.elements.get(elementId);
        const variable = element && boundVariable(element);
        const current = variable === undefined ? undefined : this.variables.get(variable);
        if (element && variable !== undefined && current !== undefined) {
            const binding = moduleFor(element).binding;
            if (binding) this.variables.set(variable, binding.write(element, value, current));
            this.variablesChanged();
        } else {
            this.memory.set(elementId, value);
            // parts of it kept in variables (e.g. a multiple choice's ticks)
            const multi = element && moduleFor(element).multiBinding;
            const names = element && multi ? multi.variables(element) : [];
            if (element && multi && names.some((name) => name !== null)) {
                const values = multi.write(element, value);
                names.forEach((name, i) => {
                    const part = values[i];
                    if (name !== null && part !== undefined) this.variables.set(name, part);
                });
                this.variablesChanged();
            } else {
                this.run?.refresh(elementId);
            }
            // (views that read it, e.g. a tree's open folders, show the change)
            this.markDirty();
        }

        // the change may trigger an action (e.g. a slider pushed past a threshold)
        const action = element && moduleFor(element).changed?.(element, before, value);
        if (action && !this.dialog) this.dispatch(action);
        // e.g. a section opening, whose contents start revealing
        this.settle();
    }

    /**
     * A key press, for the current screen's `next` rules. If a rule wants this key, the
     * first press finishes revealing the screen (if it hasn't) and the next one moves on.
     * Returns whether the key was used. `key` is a KeyboardEvent.key value.
     */
    pressKey(key: string): boolean {
        // a pause in the reveal waits for any key; one that's a button waits to be pressed,
        // though buttons' hotkeys still work
        if (!this.dialog && this.run?.paused) {
            if (this.run.pausedOnButton) {
                const hotkey = this.run.hotkey(key);
                if (!hotkey) return false;
                this.cue({ type: "select" });
                this.dispatch(hotkey);
                return true;
            }
            if (!keyMatches(["any"], key)) return false;
            this.continuePause();
            return true;
        }
        // the element being revealed gets first refusal (e.g. to interrupt a progress bar)
        if (!this.dialog && this.run?.pressKey(key, this.ticker.now())) {
            this.settle();
            return true;
        }
        // a button's hotkey
        const hotkey = !this.dialog && this.run?.hotkey(key);
        if (hotkey) {
            this.cue({ type: "select" });
            this.dispatch(hotkey);
            return true;
        }
        const rule = ruleForKey(this.rules(), key);
        if (rule) return this.trigger(rule);
        // last of all: a key that finishes the reveal, like a click
        if (!this.dialog && this.revealing && keyMatches(this.program.skipKeys, key)) {
            this.skip();
            return true;
        }
        return false;
    }

    /**
     * A tap or click, which stands in for a key on screens whose `next` rules make that
     * unambiguous (see ruleForTap). Returns whether it moved on; if not, the UI treats
     * it as an ordinary click.
     */
    tap(): boolean {
        if (!this.dialog && this.run?.paused) {
            // (a pause that's a button waits for a click on it)
            if (this.run.pausedOnButton) return false;
            this.continuePause();
            return true;
        }
        const rule = ruleForTap(this.rules());
        if (!rule || this.run?.finishedAt === null) return false;
        return this.trigger(rule);
    }

    /** Carries on after the pause the reveal is waiting at, e.g. when its button is pressed. */
    continuePause(): void {
        if (this.dialog || !this.run?.paused) return;
        this.run.continue(this.ticker.now());
        this.settle();
    }

    /** The text of the screen before this one, as it was when the player left it. */
    get previousText(): string {
        return this.previous;
    }

    /**
     * Whether anything is still appearing: the screen, an opened section's contents, a
     * transition, or the static between screens.
     */
    get revealing(): boolean {
        if (this.interstitial || this.outgoing) return true;
        return this.run !== null && (this.run.finishedAt === null || this.run.animating);
    }

    /** Finishes revealing the current screen immediately, and any transition with it. */
    skip(): void {
        this.endInterstitial(this.ticker.now());
        this.run?.skip(this.ticker.now());
        if (this.outgoing) {
            this.outgoing = null;
            this.markDirty();
        }
        this.settle();
    }

    setColumns(columns: number): void {
        if (columns === this.columns || columns < 1) return;
        this.columns = columns;
        this.run?.setColumns(columns);
        this.outgoing?.setColumns(columns);
    }

    /** Stops all timers. The terminal can't be used afterwards. */
    destroy(): void {
        this.unsubscribeTicker?.();
        this.unsubscribeTicker = null;
        this.listeners.clear();
    }

    // ─── Internals ──────────────────────────────────────────────────────────

    private readonly tick = (now: number): void => {
        this.advanceTimers(now);
        if (this.interstitial && now >= this.interstitial.until) {
            this.endInterstitial(this.interstitial.until);
        }
        this.run?.advance(now);
        this.runOutcomes(now);
        const timed = this.timedRule();
        if (timed && now >= timed.due) this.goNext(timed.rule.action);
        this.outgoing?.advance(now);
        if (this.outgoing?.erased) {
            this.outgoing = null;
            this.markDirty();
        }
        this.syncTicker();
        this.flush();
    };

    /** The current screen's `next` rules whose conditions hold. */
    private rules(): NextRule[] {
        return (this.run?.screen.next ?? []).filter((rule) => !rule.if || this.holds(rule.if));
    }

    /** The current screen's first timed `next` rule and when it fires, once that's known. */
    private timedRule(): { rule: NextRule; due: number } | null {
        const rule = firstTimedRule(this.rules());
        const finished = this.run?.finishedAt ?? null;
        if (!rule || finished === null || this.nextFired) return null;
        return { rule, due: finished + (rule.after ?? 0) };
    }

    /**
     * A key rule: finishes revealing first, if need be, then runs. Unlike a timed rule, it
     * can run again (e.g. a key that only changes a variable).
     */
    private trigger(rule: NextRule): boolean {
        if (this.dialog) return false;
        if (this.run?.finishedAt === null) {
            this.skip();
            return true;
        }
        this.dispatch(rule.action);
        return true;
    }

    /**
     * Queues an element's outcome, if it has one, and holds the run it's in (the screen's,
     * or an open section's) until it runs.
     */
    private elementFinished(
        run: ScreenRun,
        holder: ScreenRun,
        element: Element,
        reveal: Reveal,
        time: number,
    ) {
        // a timer element's own timer starts once it's been revealed
        if (element.type === "timer" && !element.timer) {
            const clock = ownClock(element);
            this.timers.set(`@${element.id}`, {
                clock,
                ms: clock.from * 1000,
                running: true,
                since: time,
            });
        }
        const outcome = moduleFor(element).outcome?.(element, reveal);
        if (!outcome) return false;
        this.outcomes.push({ run, holder, action: outcome.action, due: time + outcome.after });
        return true;
    }

    /** Runs outcomes that are due: navigating, or opening a dialog and carrying on. */
    private runOutcomes(now: number): void {
        while (true) {
            const index = this.outcomes.findIndex((o) => o.run === this.run && o.due <= now);
            const outcome = this.outcomes[index];
            if (!outcome) return;
            this.outcomes.splice(index, 1);

            const chosen = this.dispatch(outcome.action);
            // a new screen replaces the old outcomes; otherwise the screen carries on
            if (chosen?.screen !== undefined) return;
            outcome.holder.resume(now);
        }
    }

    /** After a command that may have finished elements: run what's due, then publish. */
    private settle(): void {
        this.runOutcomes(this.ticker.now());
        this.syncTicker();
        this.flush();
    }

    private goNext(action: Action): void {
        this.nextFired = true;
        this.dispatch(action);
    }

    /** Only listen to the ticker while something is animating, so an idle terminal costs nothing. */
    private syncTicker(): void {
        const animating =
            (this.run?.animating ?? false) ||
            (this.outgoing?.animating ?? false) ||
            this.timedRule() !== null ||
            this.outcomes.length > 0 ||
            [...this.timers.values()].some((timer) => timer.running) ||
            this.interstitial !== null;
        if (animating && !this.unsubscribeTicker) {
            this.unsubscribeTicker = this.ticker.subscribe(this.tick);
        } else if (!animating && this.unsubscribeTicker) {
            this.unsubscribeTicker();
            this.unsubscribeTicker = null;
        }
    }

    private effectsFor(screenId: string): ResolvedEffects {
        let effects = this.effects.get(screenId);
        if (!effects) {
            const screen = this.program.screens.get(screenId);
            effects = resolveEffects(
                this.themeEffects,
                this.configEffects,
                screen?.effects,
                this.remoteEffects,
            );
            this.effects.set(screenId, effects);
        }
        return effects;
    }

    private readonly wake = (): void => this.settle();

    private readonly cue = (cue: Cue): void => {
        for (const listener of this.cueListeners) listener(cue);
    };

    /** Removes the interstitial and starts the current screen from `time`. */
    private endInterstitial(time: number): void {
        if (!this.interstitial) return;
        this.interstitial = null;
        this.run?.start(time);
        this.markDirty();
    }

    // ─── Timers ────────────────────────────────────────────────────────────

    /** The program's timers back at their start, stopped; timer elements' own, gone. */
    private resetTimers(): void {
        this.timers.clear();
        for (const [name, timer] of this.program.timers) {
            this.timers.set(name, {
                clock: timer,
                ms: timer.from * 1000,
                running: false,
                since: 0,
            });
        }
    }

    /** Starts the timers that start with the program. */
    private startTimers(): void {
        for (const [name, timer] of this.program.timers) {
            if (timer.autostart) this.startTimer(name, this.ticker.now());
        }
    }

    /** Starts a timer, carrying on from where it stopped, or from its start if it had finished. */
    private startTimer(name: string, now: number): void {
        const timer = this.timers.get(name);
        if (!timer || timer.running) return;
        if (timer.ms === timer.clock.to * 1000) timer.ms = timer.clock.from * 1000;
        timer.running = true;
        timer.since = now;
    }

    private stopTimer(name: string, now: number): void {
        const timer = this.timers.get(name);
        if (!timer?.running) return;
        timer.ms = timerMs(timer, now);
        timer.running = false;
    }

    private resetTimer(name: string): void {
        const timer = this.timers.get(name);
        if (!timer) return;
        timer.ms = timer.clock.from * 1000;
        timer.running = false;
    }

    /**
     * Moves running timers to `now`: redraws what shows them when a second ticks over, and
     * runs the onComplete of any that finished.
     */
    private advanceTimers(now: number): void {
        let changed = false;
        const finished: Action[] = [];
        for (const timer of this.timers.values()) {
            if (!timer.running) continue;
            const before = shownSeconds(timer.clock, timer.ms);
            timer.ms = timerMs(timer, now);
            timer.since = now;
            if (shownSeconds(timer.clock, timer.ms) !== before) changed = true;
            if (timer.ms === timer.clock.to * 1000) {
                timer.running = false;
                if (timer.clock.onComplete) finished.push(timer.clock.onComplete);
            }
        }
        if (changed) this.variablesChanged();
        // after the loop: an action may navigate, which drops screen timers
        for (const action of finished) this.dispatch(action);
    }

    /** Redraws what shows variables: text on screen, and (via the snapshot) the bars. */
    private variablesChanged(): void {
        this.run?.refreshAll();
        this.variablesVersion++;
        this.markDirty();
    }

    private readonly markDirty = (): void => {
        this.dirty = true;
    };

    /** Publishes one snapshot per command or tick, however many states changed within it. */
    private flush(): void {
        if (!this.dirty) return;
        this.dirty = false;
        const snapshot = (run: ScreenRun | null) => (run ? { run, states: run.states } : null);
        this.snapshot = {
            screen: snapshot(this.run),
            outgoing:
                this.outgoing && this.outgoingTransition
                    ? {
                          run: this.outgoing,
                          states: this.outgoing.states,
                          transition: this.outgoingTransition,
                      }
                    : null,
            interstitial: this.interstitial ? { type: this.interstitial.type } : null,
            dialog: this.dialog,
            effects: this.run
                ? this.effectsFor(this.run.screen.id)
                : resolveEffects(this.themeEffects, this.configEffects),
            variables: this.variablesVersion,
            ambience:
                this.remoteAmbience === undefined
                    ? ambienceOf(this.program, this.run?.screen)
                    : this.remoteAmbience || null,
        };
        for (const listener of this.listeners) listener();
    }
}

/** A program's state, as saved (see Terminal.saveState). */
export interface SavedState {
    version: 1;
    screen: string;
    variables: Record<string, VariableValue>;
    memory: Record<string, unknown>;
    timers: Record<string, { ms: number; running: boolean }>;
    /** The screens before it, for going back (from saves since that was added). */
    history?: string[];
}

function isSavedState(state: unknown): state is SavedState {
    if (typeof state !== "object" || state === null) return false;
    const saved = state as Partial<SavedState>;
    return (
        saved.version === 1 &&
        typeof saved.screen === "string" &&
        typeof saved.variables === "object" &&
        saved.variables !== null &&
        typeof saved.memory === "object" &&
        saved.memory !== null &&
        typeof saved.timers === "object" &&
        saved.timers !== null
    );
}

interface TimerState {
    clock: Clock;
    /** Its time, as of `since`. */
    ms: number;
    running: boolean;
    /** When `ms` was last brought up to date (ticker time). */
    since: number;
}

/** A timer's time at `now`: moving towards its end while it runs, and stopping there. */
function timerMs(timer: TimerState, now: number): number {
    if (!timer.running) return timer.ms;
    const elapsed = Math.max(0, now - timer.since);
    const end = timer.clock.to * 1000;
    return countsDown(timer.clock)
        ? Math.max(end, timer.ms - elapsed)
        : Math.min(end, timer.ms + elapsed);
}
