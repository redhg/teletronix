import { type PointerEvent, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { DialogView } from "./DialogView.tsx";
import { EffectsLayer } from "./effects.tsx";
import { ScreenView } from "./ScreenView.tsx";
import { useTerminal, useTerminalSnapshot } from "./terminal-context.ts";
import { useColumns } from "./use-columns.ts";
import "./terminal.css";

const IGNORED_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"]);
const KEY_TARGETS = "input, textarea, dialog, button, a";

export function TerminalView() {
    const terminal = useTerminal();
    const { screen, outgoing, dialog, effects } = useTerminalSnapshot();
    const ref = useRef<HTMLElement>(null);

    const setColumns = useCallback((columns: number) => terminal.setColumns(columns), [terminal]);
    useColumns(ref, setColumns);

    // start once the column count is known, so the first screen wraps correctly
    useLayoutEffect(() => {
        if (!terminal.getSnapshot().screen) terminal.start();
    }, [terminal]);

    // "next": { "anyKey": true } moves on at a key press, unless the key is meant for
    // something else: typing, a dialog, moving focus, or pressing a focused link
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.repeat || IGNORED_KEYS.has(event.key)) return;
            if (event.target instanceof Element && event.target.closest(KEY_TARGETS)) return;
            if (terminal.proceed()) event.preventDefault();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [terminal]);

    // Clicking anywhere that isn't a control moves on (for "anyKey" screens) or finishes
    // the current screen, and keeps (or puts) the keyboard in the screen's prompt, if any.
    const handlePointerDown = (event: PointerEvent) => {
        if (event.target instanceof Element && event.target.closest("button, a, input, label")) {
            return;
        }
        // otherwise the click would move focus to the page, away from a prompt that the
        // skip below (or an earlier reveal) just focused
        event.preventDefault();
        if (terminal.proceed()) return;
        terminal.skip();
        ref.current
            ?.querySelector<HTMLInputElement>(".screen:not(.outgoing) .prompt input:not(:disabled)")
            ?.focus({ preventScroll: true });
    };

    return (
        <>
            <main ref={ref} className="terminal" onPointerDown={handlePointerDown}>
                {/* Both screens share one grid cell, the outgoing one on top. Keys keep a screen's
                DOM (and its frame subscriptions) alive as it moves from current to outgoing. */}
                <div className="screens">
                    {screen && <ScreenView key={screen.run.key} screen={screen} />}
                    {outgoing && (
                        <ScreenView
                            key={outgoing.run.key}
                            screen={outgoing}
                            leaving={outgoing.transition}
                        />
                    )}
                </div>
            </main>
            <EffectsLayer effects={effects} />
            {dialog && <DialogView key={dialog.id} dialog={dialog} />}
        </>
    );
}
