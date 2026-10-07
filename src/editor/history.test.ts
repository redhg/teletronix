import { describe, expect, it } from "vitest";
import { changedValue, type HistoryAction, type HistoryState, historyReducer } from "./history.ts";

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

    it("joins quick edits of the same value into one step, and nothing else", () => {
        type File = { name: string; items: string[]; on: boolean };
        const a: File = { name: "", items: ["x", "y"], on: false };
        const set = (value: File, at: number): HistoryAction<File> => ({ type: "set", value, at });
        const b = { ...a, name: "S" };
        const c = { ...b, name: "SH" };
        const d = { ...c, name: "SHIP" };
        // a move: two values at once
        const e = { ...d, items: ["y", "x"] };
        const f = { ...e, items: ["x", "y"] };
        // the same value, but too long after
        const g = { ...f, name: "SHIPS" };
        const state = [
            set(b, 0),
            set(c, 300),
            set(d, 600),
            set(e, 700),
            set(f, 800),
            set(g, 5000),
        ].reduce(historyReducer<File>, { past: [], present: a, future: [], last: null });
        expect(state.past).toEqual([a, d, e, f]);
    });

    it("finds the one value an edit changed, if only one did", () => {
        const file = { screens: { home: { content: ["HI", { type: "link", text: "> GO" }] } } };
        const typed = {
            screens: {
                home: { content: [file.screens.home.content[0], { type: "link", text: "> GOT" }] },
            },
        };
        expect(changedValue(file, typed)).toBe("/screens/home/content/1/text");
        expect(changedValue({ a: 1 }, { a: 1, b: true })).toBe("/b");
        expect(changedValue({ a: 1, b: true }, { a: 1 })).toBe("/b");
        // a value for an object, a list that's grown, two values: none
        expect(changedValue({ a: 1 }, { a: { x: 1 } })).toBe(null);
        expect(changedValue({ a: [1] }, { a: [1, 2] })).toBe(null);
        expect(changedValue({ a: [1, 2] }, { a: [2, 1] })).toBe(null);
        expect(changedValue(file, file)).toBe(null);
    });

    it("does nothing with nothing to undo or redo, or no change", () => {
        expect(run({ type: "undo" })).toBe(start);
        expect(run({ type: "redo" })).toBe(start);
        expect(run({ type: "set", value: "a", at: 0 })).toBe(start);
    });
});
