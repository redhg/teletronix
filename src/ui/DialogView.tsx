import { type KeyboardEvent, type MouseEvent, useId, useLayoutEffect, useRef } from "react";
import type { Dialog } from "../engine/index.ts";
import { classNames } from "./element-view.ts";
import { StyledText } from "./StyledText.tsx";
import { useSound } from "./sound/context.ts";
import { useTerminal } from "./terminal-context.ts";
import "./dialog.css";

/**
 * A modal dialog, on the native <dialog> element: it traps focus, makes the page inert,
 * and turns <esc> into a "cancel" event. <enter> presses the focused button, which starts
 * on the first one (OK, or the confirm button), or confirms if no button has focus.
 */
export function DialogView({ dialog }: { dialog: Dialog }) {
    const terminal = useTerminal();
    const ref = useRef<HTMLDialogElement>(null);
    const contentId = useId();

    useLayoutEffect(() => {
        const element = ref.current;
        element?.showModal();
        return () => element?.close();
    }, []);

    const sound = useSound();
    const answer = (confirmed: boolean) => {
        sound({ type: "select" });
        terminal.answerDialog(confirmed);
    };

    // a click outside (on the backdrop) cancels; for an alert, any click closes it
    const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
        const onBackdrop = event.target === event.currentTarget;
        const onButton = event.target instanceof Element && event.target.closest("button");
        if (onBackdrop || (dialog.type === "alert" && !onButton)) answer(dialog.type === "alert");
    };

    // <enter> confirms, even when focus has left the buttons (e.g. after clicking the text)
    const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
        const onButton = event.target instanceof Element && event.target.closest("button");
        if (event.key === "Enter" && !onButton) {
            event.preventDefault();
            answer(true);
        }
    };

    return (
        <dialog
            ref={ref}
            className={classNames("dialog", `dialog-${dialog.type}`, dialog.className)}
            aria-labelledby={contentId}
            onCancel={(event) => {
                // the engine decides when the dialog closes
                event.preventDefault();
                answer(false);
            }}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            <div className="dialog-body">
                <div id={contentId} className="dialog-content">
                    <StyledText text={terminal.format(dialog.content.join("\n"))} />
                </div>
                <div className="dialog-buttons">
                    {dialog.type === "alert" ? (
                        <button
                            type="button"
                            className="dialog-button"
                            onClick={() => answer(true)}
                        >
                            {dialog.dismiss}
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="dialog-button"
                                onClick={() => answer(true)}
                            >
                                {dialog.confirm.text}
                            </button>
                            <button
                                type="button"
                                className="dialog-button"
                                onClick={() => answer(false)}
                            >
                                {dialog.cancel.text}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </dialog>
    );
}
