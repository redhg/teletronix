import type { Action } from "../schema/common.ts";
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
}

export interface ScreenSnapshot {
    run: ScreenRun;
    states: readonly ElementState[];
}

/** Structural state for the UI. A new object whenever anything in it changes. */
export interface TerminalSnapshot {
    screen: ScreenSnapshot | null;
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
    private readonly listeners = new Set<() => void>();
    private columns: number;
    private run: ScreenRun | null = null;
    private dialog: Dialog | null = null;
    private snapshot: TerminalSnapshot = { screen: null, dialog: null };
    private dirty = false;
    private unsubscribeTicker: (() => void) | null = null;

    constructor({ program, ticker, columns = DEFAULT_COLUMNS, instant = false }: TerminalOptions) {
        this.program = program;
        this.ticker = ticker;
        this.columns = columns;
        this.instant = instant;
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

    /** Shows a screen from the top. Navigating to the current screen replays it. */
    navigate(screenId: string): void {
        const screen = this.program.screens.get(screenId);
        if (!screen) throw new Error(`Unknown screen "${screenId}"`);

        this.run = new ScreenRun(screen, {
            defaults: this.program.defaults,
            columns: this.columns,
            instant: this.instant,
            onChange: this.markDirty,
        });
        this.run.start(this.ticker.now());
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

    /** Finishes revealing the current screen immediately. */
    skip(): void {
        this.run?.skip();
        this.syncTicker();
        this.flush();
    }

    setColumns(columns: number): void {
        if (columns === this.columns || columns < 1) return;
        this.columns = columns;
        this.run?.setColumns(columns);
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
        this.syncTicker();
        this.flush();
    };

    /** Only listen to the ticker while something is animating, so an idle terminal costs nothing. */
    private syncTicker(): void {
        const animating = this.run?.animating ?? false;
        if (animating && !this.unsubscribeTicker) {
            this.unsubscribeTicker = this.ticker.subscribe(this.tick);
        } else if (!animating && this.unsubscribeTicker) {
            this.unsubscribeTicker();
            this.unsubscribeTicker = null;
        }
    }

    private readonly markDirty = (): void => {
        this.dirty = true;
    };

    /** Publishes one snapshot per command or tick, however many states changed within it. */
    private flush(): void {
        if (!this.dirty) return;
        this.dirty = false;
        this.snapshot = {
            screen: this.run ? { run: this.run, states: this.run.states } : null,
            dialog: this.dialog,
        };
        for (const listener of this.listeners) listener();
    }
}
