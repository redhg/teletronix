import { describe, expect, it } from "vitest";
import { ManualTicker, PausableTicker } from "./ticker.ts";

describe("a pausable ticker", () => {
    it("stands still while paused, and carries on as if it hadn't", () => {
        const inner = new ManualTicker();
        const ticker = new PausableTicker(inner);
        const ticks: number[] = [];
        ticker.subscribe((time) => ticks.push(time));
        inner.advance(100);
        ticker.pause();
        inner.advance(5000);
        expect(ticker.now()).toBe(100);
        ticker.resume();
        expect(ticker.now()).toBe(100);
        inner.advance(50);
        expect(ticker.now()).toBe(150);
        // no ticks while paused, and the rest in its own time
        expect(ticks).toEqual([100, 150]);
    });
});
