import type { Random } from "../random.ts";
import type { Reveal } from "../reveal/index.ts";
import { resolveTransition, type TransitionSpec } from "../reveal/index.ts";
import type { Action } from "../schema/common.ts";
import { type Dialog, dialogAction } from "../schema/dialog.ts";
import { type EffectsSetting, type ResolvedEffects, resolveEffects } from "../schema/effects.ts";
import type { Element } from "../schema/elements.ts";
import { moduleFor } from "../schema/elements.ts";
import { firstTimedRule, type NextRule, ruleForKey, ruleForTap } from "../schema/next.ts";
import type { Program } from "../schema/program.ts";
import type { Ticker } from "../time/ticker.ts";
import { type ElementState, ScreenRun } from "./screen-run.ts";

export interface TerminalOptions {
    program: Program;
    ticker: Ticker;
    /** Characters per line. The UI measures this and keeps it current via setColumns(). */
    columns?: number;
    /** Show everything instantly (e.g. for prefers-reduced-motion). */
    instant?: boolean;
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
}

const DEFAULT_COLUMNS = 80;

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
    /** Per-element state that outlives a screen visit (see ModuleDefinition). */
    private readonly memory = new Map<string, unknown>();
    private readonly listeners = new Set<() => void>();
    private columns: number;
    private run: ScreenRun | null = null;
    private outgoing: ScreenRun | null = null;
    private outgoingTransition: OutgoingSnapshot["transition"] | null = null;
    private interstitial: { type: "static"; until: number } | null = null;
    /** Set once the current screen's `next` has fired, so it fires only once per visit. */
    private nextFired = false;
    /** Element outcomes waiting to run, for the current screen (see ModuleDefinition.outcome). */
    private outcomes: { run: ScreenRun; action: Action; due: number }[] = [];
    private dialog: Dialog | null = null;
    /** Resolved once per screen, so effect views see the same object on every visit. */
    private readonly effects = new Map<string, ResolvedEffects>();
    /** The program-wide effects: the config's, unless replaced with setEffects(). */
    private configEffects: EffectsSetting | undefined;
    private snapshot: TerminalSnapshot = {
        screen: null,
        outgoing: null,
        interstitial: null,
        dialog: null,
        effects: {},
    };
    private dirty = false;
    private unsubscribeTicker: (() => void) | null = null;

    constructor(options: TerminalOptions) {
        this.program = options.program;
        this.ticker = options.ticker;
        this.columns = options.columns ?? DEFAULT_COLUMNS;
        this.instant = options.instant ?? false;
        this.random = options.random;
        this.load = options.load;
        this.configEffects = options.program.effects;
    }

    // ─── Store interface (e.g. for React's useSyncExternalStore) ────────────

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getSnapshot = (): TerminalSnapshot => this.snapshot;

    // ─── Commands ───────────────────────────────────────────────────────────

    /** Shows the start screen. */
    start(): void {
        this.navigate(this.program.start);
    }

    dispatch(action: Action): void {
        switch (action.type) {
            case "screen":
                this.navigate(action.target);
                break;
            case "dialog":
                this.openDialog(action.target);
                break;
        }
    }

    /**
     * Shows a screen from the top. Navigating to the current screen replays it.
     *
     * With a glitch or fade transition, the current screen stays on screen and erases (or
     * fades) itself over the new one while the new one starts revealing, and is dropped
     * once that's finished.
     */
    navigate(screenId: string): void {
        const screen = this.program.screens.get(screenId);
        if (!screen) throw new Error(`Unknown screen "${screenId}"`);
        const now = this.ticker.now();
        this.dialog = null;
        this.nextFired = false;
        this.outcomes = [];

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
        }

        const run: ScreenRun = new ScreenRun(screen, {
            defaults: this.program.defaults,
            columns: this.columns,
            instant: this.instant,
            now: () => this.ticker.now(),
            load: this.load,
            memory: this.memory,
            random: this.random,
            onChange: this.markDirty,
            onWake: this.wake,
            onFinished: (element, reveal, time) => this.elementFinished(run, element, reveal, time),
        });
        this.run = run;
        if (!this.interstitial) this.run.start(now);
        this.markDirty();
        this.settle();
    }

    openDialog(dialogId: string): void {
        const dialog = this.program.dialogs.get(dialogId);
        if (!dialog) throw new Error(`Unknown dialog "${dialogId}"`);
        this.dialog = dialog;
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

    /** Replaces the program-wide effects, e.g. while trying out settings in a preview. */
    setEffects(effects: EffectsSetting | undefined): void {
        this.configEffects = effects;
        this.effects.clear();
        this.markDirty();
        this.flush();
    }

    /** Reads an element's memory. */
    recall<M>(elementId: string): M | undefined {
        return this.memory.get(elementId) as M | undefined;
    }

    /** Updates an element's memory, and its text on screen if that depends on it. */
    remember(elementId: string, value: unknown): void {
        this.memory.set(elementId, value);
        this.run?.refresh(elementId);
    }

    /**
     * A key press, for the current screen's `next` rules. If a rule wants this key, the
     * first press finishes revealing the screen (if it hasn't) and the next one moves on.
     * Returns whether the key was used. `key` is a KeyboardEvent.key value.
     */
    pressKey(key: string): boolean {
        // the element being revealed gets first refusal (e.g. to interrupt a progress bar)
        if (!this.dialog && this.run?.pressKey(key, this.ticker.now())) {
            this.settle();
            return true;
        }
        const rules = this.run?.screen.next;
        const rule = rules && ruleForKey(rules, key);
        return rule ? this.trigger(rule) : false;
    }

    /**
     * A tap or click, which stands in for a key on screens whose `next` rules make that
     * unambiguous (see ruleForTap). Returns whether it moved on; if not, the UI treats
     * it as an ordinary click.
     */
    tap(): boolean {
        const rules = this.run?.screen.next;
        const rule = rules && ruleForTap(rules);
        if (!rule || this.run?.finishedAt === null) return false;
        return this.trigger(rule);
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

    /** The current screen's first timed `next` rule and when it fires, once that's known. */
    private timedRule(): { rule: NextRule; due: number } | null {
        const rule = this.run?.screen.next && firstTimedRule(this.run.screen.next);
        const finished = this.run?.finishedAt ?? null;
        if (!rule || finished === null || this.nextFired) return null;
        return { rule, due: finished + (rule.after ?? 0) };
    }

    /** Finishes revealing first, if need be; moves on once revealed. */
    private trigger(rule: NextRule): boolean {
        if (this.dialog || this.nextFired) return false;
        if (this.run?.finishedAt === null) {
            this.skip();
            return true;
        }
        this.goNext(rule.action);
        return true;
    }

    /** Queues an element's outcome, if it has one, and holds its screen until it runs. */
    private elementFinished(run: ScreenRun, element: Element, reveal: Reveal, time: number) {
        const outcome = moduleFor(element).outcome?.(element, reveal);
        if (!outcome) return false;
        this.outcomes.push({ run, action: outcome.action, due: time + outcome.after });
        return true;
    }

    /** Runs outcomes that are due: navigating, or opening a dialog and carrying on. */
    private runOutcomes(now: number): void {
        while (true) {
            const index = this.outcomes.findIndex((o) => o.run === this.run && o.due <= now);
            const outcome = this.outcomes[index];
            if (!outcome) return;
            this.outcomes.splice(index, 1);

            this.dispatch(outcome.action);
            // a new screen replaces the old outcomes; a dialog lets the screen carry on
            if (outcome.action.type === "dialog") outcome.run.resume(now);
            else return;
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
            effects = resolveEffects(this.configEffects, screen?.effects);
            this.effects.set(screenId, effects);
        }
        return effects;
    }

    private readonly wake = (): void => this.settle();

    /** Removes the interstitial and starts the current screen from `time`. */
    private endInterstitial(time: number): void {
        if (!this.interstitial) return;
        this.interstitial = null;
        this.run?.start(time);
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
            effects: this.run ? this.effectsFor(this.run.screen.id) : resolveEffects(),
        };
        for (const listener of this.listeners) listener();
    }
}
