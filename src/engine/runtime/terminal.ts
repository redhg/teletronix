import type { Random } from "../random.ts";
import { resolveTransition } from "../reveal/index.ts";
import type { Action } from "../schema/common.ts";
import type { Element } from "../schema/elements.ts";
import type { Dialog, Program } from "../schema/program.ts";
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

/** Structural state for the UI. A new object whenever anything in it changes. */
export interface TerminalSnapshot {
    screen: ScreenSnapshot | null;
    /** The previous screen, while it erases itself over the current one. */
    outgoing: ScreenSnapshot | null;
    dialog: Dialog | null;
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
    private dialog: Dialog | null = null;
    private snapshot: TerminalSnapshot = { screen: null, outgoing: null, dialog: null };
    private dirty = false;
    private unsubscribeTicker: (() => void) | null = null;

    constructor(options: TerminalOptions) {
        this.program = options.program;
        this.ticker = options.ticker;
        this.columns = options.columns ?? DEFAULT_COLUMNS;
        this.instant = options.instant ?? false;
        this.random = options.random;
        this.load = options.load;
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
     * With a glitch transition, the current screen stays on screen and erases itself over
     * the new one while the new one starts revealing, and is dropped once it's erased.
     */
    navigate(screenId: string): void {
        const screen = this.program.screens.get(screenId);
        if (!screen) throw new Error(`Unknown screen "${screenId}"`);
        const now = this.ticker.now();

        const transition = resolveTransition(screen.transition, this.program.defaults);
        // a transition that's still playing is cut short by the next one
        this.outgoing = null;
        if (this.run && transition.type === "glitch" && !this.instant) {
            this.outgoing = this.run;
            this.outgoing.erase(now, transition.duration);
        }

        this.run = new ScreenRun(screen, {
            defaults: this.program.defaults,
            columns: this.columns,
            instant: this.instant,
            now: () => this.ticker.now(),
            load: this.load,
            memory: this.memory,
            random: this.random,
            onChange: this.markDirty,
            onWake: this.wake,
        });
        this.run.start(now);
        this.markDirty();
        this.syncTicker();
        this.flush();
    }

    openDialog(dialogId: string): void {
        const dialog = this.program.dialogs.get(dialogId);
        if (!dialog) throw new Error(`Unknown dialog "${dialogId}"`);
        this.dialog = dialog;
        this.markDirty();
        this.flush();
    }

    closeDialog(): void {
        if (!this.dialog) return;
        this.dialog = null;
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

    /** Finishes revealing the current screen immediately, and any transition with it. */
    skip(): void {
        this.run?.skip();
        if (this.outgoing) {
            this.outgoing = null;
            this.markDirty();
        }
        this.syncTicker();
        this.flush();
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
        this.run?.advance(now);
        this.outgoing?.advance(now);
        if (this.outgoing?.erased) {
            this.outgoing = null;
            this.markDirty();
        }
        this.syncTicker();
        this.flush();
    };

    /** Only listen to the ticker while something is animating, so an idle terminal costs nothing. */
    private syncTicker(): void {
        const animating = (this.run?.animating ?? false) || (this.outgoing?.animating ?? false);
        if (animating && !this.unsubscribeTicker) {
            this.unsubscribeTicker = this.ticker.subscribe(this.tick);
        } else if (!animating && this.unsubscribeTicker) {
            this.unsubscribeTicker();
            this.unsubscribeTicker = null;
        }
    }

    private readonly wake = (): void => {
        this.syncTicker();
        this.flush();
    };

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
            outgoing: snapshot(this.outgoing),
            dialog: this.dialog,
        };
        for (const listener of this.listeners) listener();
    }
}
