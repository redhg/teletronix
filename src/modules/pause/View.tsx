import { useEffect, useRef } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import type { PauseElement } from "./definition.ts";

/**
 * The line a pause shows while it waits; it goes once the player carries on. As a button,
 * it takes the keyboard once it's waiting, and carries on when pressed.
 */
export function PauseView({ element, state, run, index }: ElementViewProps<PauseElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    const waiting = run.pausedOn(element.id);
    const button = useRef<HTMLButtonElement>(null);
    const usable = element.button && waiting;
    useEffect(() => {
        if (usable) button.current?.focus({ preventScroll: true });
    }, [usable]);

    if (state !== "active" && !waiting) return null;
    const text = <RevealText run={run} index={index} />;
    if (!usable) {
        return (
            <div className={classNames("pause", element.className)} role="status">
                {text}
            </div>
        );
    }
    return (
        <button
            ref={button}
            type="button"
            className={classNames("pause control", element.className)}
            onClick={() => {
                sound({ type: "select" });
                terminal.continuePause();
            }}
        >
            {text}
        </button>
    );
}
