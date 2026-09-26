import { type PointerEvent, useCallback, useLayoutEffect, useRef } from "react";
import { ScreenView } from "./ScreenView.tsx";
import { useTerminal, useTerminalSnapshot } from "./terminal-context.ts";
import { useColumns } from "./use-columns.ts";
import "./terminal.css";

export function TerminalView() {
    const terminal = useTerminal();
    const { screen } = useTerminalSnapshot();
    const ref = useRef<HTMLElement>(null);

    const setColumns = useCallback((columns: number) => terminal.setColumns(columns), [terminal]);
    useColumns(ref, setColumns);

    // start once the column count is known, so the first screen wraps correctly
    useLayoutEffect(() => {
        if (!terminal.getSnapshot().screen) terminal.start();
    }, [terminal]);

    // clicking anywhere that isn't a control finishes the current screen
    const handlePointerDown = (event: PointerEvent) => {
        if (event.target instanceof Element && event.target.closest("button, a, input")) return;
        terminal.skip();
    };

    return (
        <main ref={ref} className="terminal" onPointerDown={handlePointerDown}>
            {screen && <ScreenView key={screen.run.key} screen={screen} />}
        </main>
    );
}
