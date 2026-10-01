import { describe, expect, it } from "vitest";
import { seededRandom } from "../../engine/random.ts";
import { clockSeconds, type LogElement, passOrder, stamp } from "./definition.ts";

const log = (overrides: Partial<LogElement> = {}): LogElement => ({
    id: "x",
    type: "log",
    lines: ["A", "B", "C", "D"],
    interval: 1000,
    loop: false,
    order: "sequence",
    ...overrides,
});

describe("a log", () => {
    it("stamps lines with a clock time", () => {
        expect(clockSeconds("06:12")).toBe(6 * 3600 + 12 * 60);
        expect(stamp(clockSeconds("06:12:30") + 31)).toBe("[06:13:01]");
        expect(stamp(clockSeconds("23:59:59") + 2)).toBe("[00:00:01]");
    });

    it("goes through its lines in order, or every one in a random order", () => {
        expect(passOrder(log(), Math.random)).toEqual([0, 1, 2, 3]);
        const shuffled = passOrder(log({ order: "random" }), seededRandom(2));
        expect([...shuffled].sort()).toEqual([0, 1, 2, 3]);
        expect(shuffled).not.toEqual([0, 1, 2, 3]);
    });
});
