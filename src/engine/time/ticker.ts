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

/**
 * A ticker that can be paused: while it is, time stands still (its now() doesn't move) and it
 * doesn't tick, so everything that runs on it waits; resumed, it carries on from where it
 * stopped, as if the pause never happened.
 */
export class PausableTicker implements Ticker {
    private readonly inner: Ticker;
    /** How much time has passed paused, to leave out */
    private offset = 0;
    /** When it paused, by the inner ticker, or null while it runs */
    private pausedAt: number | null = null;

    constructor(inner: Ticker) {
        this.inner = inner;
    }

    get paused(): boolean {
        return this.pausedAt !== null;
    }

    now(): number {
        return (this.pausedAt ?? this.inner.now()) - this.offset;
    }

    pause(): void {
        if (this.pausedAt === null) this.pausedAt = this.inner.now();
    }

    resume(): void {
        if (this.pausedAt === null) return;
        this.offset += this.inner.now() - this.pausedAt;
        this.pausedAt = null;
    }

    subscribe(listener: TickListener): () => void {
        return this.inner.subscribe((time) => {
            if (this.pausedAt === null) listener(time - this.offset);
        });
    }
}
