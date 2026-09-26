import {
    type PointerEvent,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { staticEffect } from "../effects/static/definition.ts";
import { StaticView } from "../effects/static/View.tsx";
import { AutoscrollContext, Autoscroller } from "./autoscroll.ts";
import { DialogView } from "./DialogView.tsx";
import { EffectsLayer } from "./effects.tsx";
import { ScreenView } from "./ScreenView.tsx";
import { useTerminal, useTerminalSnapshot } from "./terminal-context.ts";
import { useColumns } from "./use-columns.ts";
import "./terminal.css";

const INTERSTITIAL_STATIC = { ...staticEffect.defaults, opacity: 1 };
const KEY_TARGETS = "input, textarea, dialog, button, a";

interface Props {
    /** Changes when something that affects the line length changes (e.g. the font). */
    layoutKey?: string;
}

export function TerminalView({ layoutKey }: Props) {
    const terminal = useTerminal();
    const { screen, outgoing, interstitial, dialog, effects } = useTerminalSnapshot();
    const ref = useRef<HTMLElement>(null);
    const screensRef = useRef<HTMLDivElement>(null);
    const [autoscroll] = useState(() => new Autoscroller());
    useEffect(() => autoscroll.attach(), [autoscroll]);

    // follow the current screen; a new screen starts at the top
    const screenKey = screen?.run.key;
    const autoscrollOn = screen?.run.screen.autoscroll ?? terminal.program.autoscroll;
    useLayoutEffect(() => {
        const current = screensRef.current?.querySelector<HTMLElement>(".screen:not(.outgoing)");
        autoscroll.setScreen(screenKey === undefined ? null : (current ?? null), autoscrollOn);
    }, [autoscroll, screenKey, autoscrollOn]);

    const setColumns = useCallback((columns: number) => terminal.setColumns(columns), [terminal]);
    useColumns(ref, setColumns, layoutKey);

    // start once the column count is known, so the first screen wraps correctly
    useLayoutEffect(() => {
        if (!terminal.getSnapshot().screen) terminal.start();
    }, [terminal]);

    // Keys for the screen's "next" rules, unless the key is meant for something else:
    // typing, a dialog, or pressing a focused link
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.repeat) return;
            if (event.target instanceof Element && event.target.closest(KEY_TARGETS)) return;
            if (terminal.pressKey(event.key)) event.preventDefault();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [terminal]);

    // Clicking anywhere that isn't a control moves on (standing in for a "next" key) or
    // finishes the current screen, and keeps (or puts) the keyboard in the screen's prompt.
    const handlePointerDown = (event: PointerEvent) => {
        if (event.target instanceof Element && event.target.closest("button, a, input, label")) {
            return;
        }
        // otherwise the click would move focus to the page, away from a prompt that the
        // skip below (or an earlier reveal) just focused
        event.preventDefault();
        if (terminal.tap()) return;
        terminal.skip();
        ref.current
            ?.querySelector<HTMLInputElement>(".screen:not(.outgoing) .prompt input:not(:disabled)")
            ?.focus({ preventScroll: true });
    };

    const outgoingView = outgoing && (
        <ScreenView key={outgoing.run.key} screen={outgoing} leaving={outgoing.transition} />
    );

    return (
        <AutoscrollContext value={autoscroll}>
            <main ref={ref} className="terminal" onPointerDown={handlePointerDown}>
                {/* Both screens share one grid cell. Later siblings paint on top, so a fading
                screen goes before the current one (afterglow behind the new text) and a
                glitching one after it (erasing over it). Keys keep a screen's DOM, and its frame
                subscriptions, alive as it moves from current to outgoing. */}
                <div ref={screensRef} className="screens">
                    {outgoing?.transition.type === "fade" && outgoingView}
                    {screen && <ScreenView key={screen.run.key} screen={screen} />}
                    {outgoing?.transition.type === "glitch" && outgoingView}
                </div>
            </main>
            {/* "transition": "static": noise between screens, under the other effects */}
            {interstitial?.type === "static" && (
                <div className="interstitial" aria-hidden="true">
                    <StaticView options={INTERSTITIAL_STATIC} />
                </div>
            )}
            <EffectsLayer effects={effects} />
            {dialog && <DialogView key={dialog.id} dialog={dialog} />}
        </AutoscrollContext>
    );
}
