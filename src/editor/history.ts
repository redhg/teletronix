import { useCallback, useReducer } from "react";

/** How soon after the last, an edit of the same thing joins it in one step (a drag, typing). */
const JOIN_MS = 1000;
/** How many steps back undo goes. */
const STEPS = 200;

/** An edited value, with the steps before (to undo) and after (to redo) it. */
export interface HistoryState<T> {
    past: T[];
    present: T;
    future: T[];
    /** What the last edit changed, and when: one like it, soon after, joins it */
    last: { group: string; at: number } | null;
}

export type HistoryAction<T> =
    | { type: "set"; value: T; group?: string; at: number }
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
            const join =
                action.group !== undefined &&
                state.last?.group === action.group &&
                action.at - state.last.at < JOIN_MS;
            return {
                past: join ? state.past : [...state.past, state.present].slice(-STEPS),
                present: action.value,
                future: [],
                last: action.group === undefined ? null : { group: action.group, at: action.at },
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

export interface History<T> {
    value: T;
    /** Changes it; edits in the same `group` (e.g. a field's path) soon after join into one step. */
    set: (value: T, group?: string) => void;
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
    const set = useCallback(
        (value: T, group?: string) => dispatch({ type: "set", value, group, at: Date.now() }),
        [],
    );
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
