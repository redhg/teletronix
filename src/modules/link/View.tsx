import type { CSSProperties } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import { type LinkElement, linkAction } from "./definition.ts";
import { LONG_PRESS_MS, useSecondaryPress } from "./use-secondary-press.ts";
import "./style.css";

export function LinkView({ element, state, run, index }: ElementViewProps<LinkElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    const hasSecondary = element.secondaryAction !== undefined;
    const { holding, handlers } = useSecondaryPress(hasSecondary, (secondary) => {
        sound({ type: "select" });
        terminal.dispatch(linkAction(element, secondary));
    });
    const content = <RevealText run={run} index={index} />;

    // a link only becomes usable once it has been fully revealed
    if (state !== "done") {
        return <div className={classNames("link control", element.className)}>{content}</div>;
    }

    return (
        <button
            type="button"
            className={classNames(
                "link control",
                hasSecondary && "has-secondary",
                holding && "holding",
                element.className,
            )}
            style={{ "--hold-duration": `${LONG_PRESS_MS}ms` } as CSSProperties}
            {...handlers}
        >
            {content}
        </button>
    );
}
