import { useCallback, useReducer } from "react";

/** How soon after the last, an edit of the same value joins it in one step (typing, a slider). */
const JOIN_MS = 1000;
/** How many steps back undo goes. */
const STEPS = 200;

/** An edited value, with the steps before (to undo) and after (to redo) it. */
export interface HistoryState<T> {
    past: T[];
    present: T;
    future: T[];
    /** The value the last edit changed, and when: an edit of it, soon after, joins it */
    last: { path: string; at: number } | null;
}

export type HistoryAction<T> =
    | { type: "set"; value: T; at: number }
    | { type: "undo" }
    | { type: "redo" }
    | { type: "reset"; value: T };

export function historyReducer<T>(
    state: HistoryState<T>,
    action: HistoryAction<T>,
): HistoryState<T> {
    switch (action.type) {
        case "set": {
            if (action.value === state.present) return state;
            const path = changedValue(state.present, action.value);
            const join =
                path !== null && state.last?.path === path && action.at - state.last.at < JOIN_MS;
            return {
                past: join ? state.past : [...state.past, state.present].slice(-STEPS),
                present: action.value,
                future: [],
                last: path === null ? null : { path, at: action.at },
            };
        }
        case "undo": {
            const previous = state.past.at(-1);
            if (previous === undefined) return state;
            return {
                past: state.past.slice(0, -1),
                present: previous,
                future: [state.present, ...state.future],
                last: null,
            };
        }
        case "redo": {
            const [next, ...rest] = state.future;
            if (next === undefined) return state;
            return {
                past: [...state.past, state.present],
                present: next,
                future: rest,
                last: null,
            };
        }
        case "reset":
            return { past: [], present: action.value, future: [], last: null };
    }
}

/**
 * Where the one value that differs between two versions is (a string, number or true/false,
 * set, changed or left out), or null if more than that differs: a move, an element added or
 * deleted, a rename. Parts that didn't change are the same objects (see setIn), so it only
 * looks down the parts that did.
 */
export function changedValue(before: unknown, after: unknown, path = ""): string | null {
    if (before === after) return null;
    const isObject = (value: unknown): value is Record<string, unknown> =>
        typeof value === "object" && value !== null;
    if (!isObject(before) || !isObject(after)) {
        // one value for another (or set, or left out), not a whole object
        return isObject(before) || isObject(after) ? null : path;
    }
    if (Array.isArray(before) !== Array.isArray(after)) return null;
    // a list that's grown or shrunk is elements added or deleted
    if (Array.isArray(before) && before.length !== (after as unknown as unknown[]).length) {
        return null;
    }
    let found: string | null = null;
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (before[key] === after[key]) continue;
        if (found !== null) return null;
        const inner = changedValue(before[key], after[key], `${path}/${key}`);
        if (inner === null) return null;
        found = inner;
    }
    return found;
}

export interface History<T> {
    value: T;
    /** Changes it; a quick run of edits to the same value (typing, a slider) is one step. */
    set: (value: T) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    /** Starts afresh with `value`, nothing to undo (e.g. another file opened). */
    reset: (value: T) => void;
}

/** A value with undo and redo. */
export function useHistory<T>(initial: T): History<T> {
    const [state, dispatch] = useReducer(historyReducer<T>, {
        past: [],
        present: initial,
        future: [],
        last: null,
    });
    const set = useCallback((value: T) => dispatch({ type: "set", value, at: Date.now() }), []);
    const undo = useCallback(() => dispatch({ type: "undo" }), []);
    const redo = useCallback(() => dispatch({ type: "redo" }), []);
    const reset = useCallback((value: T) => dispatch({ type: "reset", value }), []);
    return {
        value: state.present,
        set,
        undo,
        redo,
        canUndo: state.past.length > 0,
        canRedo: state.future.length > 0,
        reset,
    };
}
