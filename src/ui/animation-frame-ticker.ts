import type { Ticker, TickListener } from "../engine/index.ts";

/** Drives the engine from requestAnimationFrame. Stops requesting frames when nobody listens. */
export class AnimationFrameTicker implements Ticker {
    private readonly listeners = new Set<TickListener>();
    private frameId: number | null = null;

    now(): number {
        return performance.now();
    }

    subscribe(listener: TickListener): () => void {
        this.listeners.add(listener);
        this.frameId ??= requestAnimationFrame(this.tick);
        return () => {
            this.listeners.delete(listener);
            if (this.listeners.size === 0 && this.frameId !== null) {
                cancelAnimationFrame(this.frameId);
                this.frameId = null;
            }
        };
    }

    private readonly tick = (now: number): void => {
        this.frameId = null;
        for (const listener of [...this.listeners]) listener(now);
        if (this.listeners.size > 0) {
            this.frameId ??= requestAnimationFrame(this.tick);
        }
    };
}
