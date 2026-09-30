import { describe, expect, it } from "vitest";
import type { Frame } from "../../engine/reveal/types.ts";
import { type CounterElement, counterValue, createCounterReveal } from "./definition.ts";

const counter = (overrides: Partial<CounterElement> = {}): CounterElement => ({
    id: "x",
    type: "counter",
    label: "MEM: ",
    from: 0,
    to: 640,
    step: 1,
    duration: 1000,
    unit: "K",
    done: " OK",
    ...overrides,
});

const text = (frame: Frame) => frame.map((segment) => segment.text).join("");

describe("counterValue", () => {
    it("counts in whole steps, and ends exactly on `to`", () => {
        expect(counterValue(counter(), 0)).toBe(0);
        expect(counterValue(counter(), 0.5)).toBe(320);
        expect(counterValue(counter({ step: 64 }), 0.3)).toBe(192);
        expect(counterValue(counter({ to: 100, step: 64 }), 0.99)).toBe(64);
        expect(counterValue(counter({ to: 100, step: 64 }), 1)).toBe(100);
    });

    it("counts down", () => {
        expect(counterValue(counter({ from: 100, to: 0 }), 0.25)).toBe(75);
    });
});

describe("counter", () => {
    it("appears, counts, then adds its done text", () => {
        const r = createCounterReveal(
            counter(),
            { type: "instant" },
            { columns: () => 80, memory: () => undefined },
        );
        expect(r.duration).toBe(1000);
        expect(text(r.frame(0))).toBe("MEM: 0K");
        expect(text(r.frame(500))).toBe("MEM: 320K");
        expect(text(r.final())).toBe("MEM: 640K OK");
    });

    it("finishes at once when everything shows at once", () => {
        const r = createCounterReveal(
            counter(),
            { type: "instant" },
            { columns: () => 80, memory: () => undefined, instant: true },
        );
        expect(r.duration).toBe(0);
    });
});
