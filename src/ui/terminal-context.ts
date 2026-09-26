import { createContext, useContext, useSyncExternalStore } from "react";
import type { Terminal, TerminalSnapshot } from "../engine/index.ts";

export const TerminalContext = createContext<Terminal | null>(null);

export function useTerminal(): Terminal {
    const terminal = useContext(TerminalContext);
    if (!terminal) throw new Error("useTerminal() must be used inside a TerminalContext");
    return terminal;
}

/** Structural terminal state. Re-renders on screen, element-state and dialog changes only. */
export function useTerminalSnapshot(): TerminalSnapshot {
    const terminal = useTerminal();
    return useSyncExternalStore(terminal.subscribe, terminal.getSnapshot);
}
