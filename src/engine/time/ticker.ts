export type TickListener = (now: number) => void;

/**
 * The engine's only source of time. The browser implementation wraps
 * requestAnimationFrame; tests use {@link ManualTicker}.
 */
export interface Ticker {
    now(): number;
    /** Called once per frame while subscribed. Implementations should idle with no subscribers. */
    subscribe(listener: TickListener): () => void;
}

/** A ticker that only moves when told to. For tests. */
export class ManualTicker implements Ticker {
    private time = 0;
    private readonly listeners = new Set<TickListener>();

    now(): number {
        return this.time;
    }

    subscribe(listener: TickListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    get active(): boolean {
        return this.listeners.size > 0;
    }

    /** Moves time forward by `ms`, ticking every `step` ms along the way (default: once). */
    advance(ms: number, step = ms): void {
        const end = this.time + ms;
        while (this.time < end) {
            this.time = Math.min(this.time + step, end);
            for (const listener of [...this.listeners]) listener(this.time);
        }
    }
}
