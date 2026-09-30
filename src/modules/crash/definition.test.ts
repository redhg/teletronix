import { describe, expect, it } from "vitest";
import { seededRandom } from "../../engine/random.ts";
import { CrashGrid } from "./definition.ts";

const grid = (start = "HELLO\nWORLD") =>
    new CrashGrid({
        columns: 10,
        rows: 4,
        start,
        fragments: ["FRAGMENT"],
        message: ["BOOM"],
        random: seededRandom(1),
    });

describe("a crash", () => {
    it("starts from the screen before, filling the window", () => {
        expect(grid().toString()).toBe("HELLO     \nWORLD     \n          \n          ");
    });

    it("gets worse, keeping its size", () => {
        const crash = grid();
        const before = crash.toString();
        for (let i = 0; i < 50; i++) crash.corrupt();
        const after = crash.toString();
        expect(after).not.toBe(before);
        expect(after.split("\n").map((row) => [...row].length)).toEqual([10, 10, 10, 10]);
    });

    it("barely changes while it takes hold", () => {
        const crash = grid();
        crash.corrupt(0);
        expect(crash.toString()).toBe(grid().toString());
    });

    it("shows its message centered", () => {
        const crash = grid("");
        crash.showMessage();
        expect(crash.toString()).toMatch(/^ {3}BOOM {3}$/m);
    });

    it("leaves its message alone for a while, so it can be read", () => {
        const crash = grid("");
        crash.showMessage(3);
        for (let i = 0; i < 3; i++) {
            crash.corrupt();
            expect(crash.toString()).toContain("BOOM");
        }
    });

    it("keeps what fits when the window changes size", () => {
        const crash = grid();
        crash.resize(3, 1);
        expect(crash.toString()).toBe("HEL");
    });
});
