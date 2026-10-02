import { describe, expect, it } from "vitest";
import { type HistoryAction, type HistoryState, historyReducer } from "./history.ts";

const start: HistoryState<string> = { past: [], present: "a", future: [], last: null };
const run = (...actions: HistoryAction<string>[]) => actions.reduce(historyReducer, start);

describe("undo history", () => {
    it("undoes and redoes, and an edit after undoing drops what was undone", () => {
        let state = run({ type: "set", value: "b", at: 0 }, { type: "set", value: "c", at: 5000 });
        state = historyReducer(state, { type: "undo" });
        expect(state.present).toBe("b");
        state = historyReducer(state, { type: "redo" });
        expect(state.present).toBe("c");
        state = run(
            { type: "set", value: "b", at: 0 },
            { type: "undo" },
            { type: "set", value: "x", at: 5000 },
        );
        expect(state).toMatchObject({ past: ["a"], present: "x", future: [] });
    });

    it("joins quick edits of the same thing into one step", () => {
        const state = run(
            { type: "set", value: "b", group: "name", at: 0 },
            { type: "set", value: "bc", group: "name", at: 400 },
            { type: "set", value: "bcd", group: "name", at: 800 },
            { type: "set", value: "bcd!", group: "other", at: 900 },
            { type: "set", value: "bcd!?", group: "other", at: 3000 },
        );
        expect(state.past).toEqual(["a", "bcd", "bcd!"]);
    });

    it("does nothing with nothing to undo or redo, or no change", () => {
        expect(run({ type: "undo" })).toBe(start);
        expect(run({ type: "redo" })).toBe(start);
        expect(run({ type: "set", value: "a", at: 0 })).toBe(start);
    });
});
