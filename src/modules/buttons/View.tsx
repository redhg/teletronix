import { type CSSProperties, type KeyboardEvent, useEffect, useState } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import { LONG_PRESS_MS, useSecondaryPress } from "../link/use-secondary-press.ts";
import { type Button, type ButtonsElement, buttonLabel, hotkeyIndex } from "./definition.ts";
import "./style.css";

export function ButtonsView({
    element,
    interactive,
    run,
    index,
}: ElementViewProps<ButtonsElement>) {
    // the row as laid out on screen (wrapped and aligned), redrawn when the columns change
    const [drawn, setDrawn] = useState("");
    useEffect(
        () =>
            run.subscribeFrame(index, (frame) =>
                setDrawn(frame.map((segment) => segment.text).join("")),
            ),
        [run, index],
    );
    const className = classNames("buttons", element.className);

    if (!interactive) {
        return (
            <div className={className}>
                <RevealText run={run} index={index} />
            </div>
        );
    }

    // each [ LABEL ] in the laid-out text becomes its button, in place
    const pieces: (string | Button)[] = [];
    let at = 0;
    for (const button of element.buttons) {
        const start = drawn.indexOf(buttonLabel(button), at);
        if (start === -1) continue;
        if (start > at) pieces.push(drawn.slice(at, start));
        pieces.push(button);
        at = start + buttonLabel(button).length;
    }
    if (at < drawn.length) pieces.push(drawn.slice(at));

    // the arrow keys move along the row
    const handleKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
        const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
        if (!step) return;
        const buttons = [...event.currentTarget.querySelectorAll("button")];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = buttons[current + step];
        if (current === -1 || !next) return;
        event.preventDefault();
        next.focus();
    };

    return (
        <fieldset className={className} onKeyDown={handleKeyDown}>
            {pieces.map((piece, k) =>
                typeof piece === "string" ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: laid out afresh each time
                    <span key={k}>{piece}</span>
                ) : (
                    <ButtonControl key={piece.text + String(k)} button={piece} />
                ),
            )}
        </fieldset>
    );
}

function ButtonControl({ button }: { button: Button }) {
    const terminal = useTerminal();
    const sound = useSound();
    const hasSecondary = button.secondaryAction !== undefined;
    const { holding, handlers } = useSecondaryPress(hasSecondary, (secondary) => {
        sound({ type: "select" });
        terminal.dispatch(
            secondary && button.secondaryAction ? button.secondaryAction : button.action,
        );
    });
    const label = buttonLabel(button);
    // the hotkey's letter, underlined: two characters in, past "[ "
    const hotkey = hotkeyIndex(button);
    const content =
        hotkey === -1 ? (
            label
        ) : (
            <>
                {label.slice(0, hotkey + 2)}
                <u>{label.charAt(hotkey + 2)}</u>
                {label.slice(hotkey + 3)}
            </>
        );

    return (
        <button
            type="button"
            className={classNames("button", holding && "holding", button.className)}
            style={{ "--hold-duration": `${LONG_PRESS_MS}ms` } as CSSProperties}
            aria-keyshortcuts={button.key}
            {...handlers}
        >
            {content}
        </button>
    );
}
