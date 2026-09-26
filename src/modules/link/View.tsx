import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import { useTerminal } from "../../ui/terminal-context.ts";
import { type LinkElement, linkAction } from "./definition.ts";
import "./style.css";

export function LinkView({ element, state, run, index }: ElementViewProps<LinkElement>) {
    const terminal = useTerminal();
    const className = classNames("link", element.className);
    const content = <RevealText run={run} index={index} text={element.text} />;

    // a link only becomes usable once it has been fully revealed
    if (state !== "done") {
        return <div className={className}>{content}</div>;
    }

    return (
        <button
            type="button"
            className={className}
            onClick={(event) =>
                terminal.dispatch(linkAction(element, { shiftKey: event.shiftKey }))
            }
        >
            {content}
        </button>
    );
}
