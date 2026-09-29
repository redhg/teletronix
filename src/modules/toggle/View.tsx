import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import { nextToggleState, type ToggleElement, type ToggleMemory } from "./definition.ts";

export function ToggleView({ element, interactive, run, index }: ElementViewProps<ToggleElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    const className = classNames("toggle control", element.className);
    const content = <RevealText run={run} index={index} />;

    if (!interactive) {
        return <div className={className}>{content}</div>;
    }

    // the new text arrives through the frame channel, so this doesn't re-render
    const handleClick = () => {
        sound({ type: "select" });
        const memory = terminal.recall<ToggleMemory>(element.id);
        terminal.remember(element.id, nextToggleState(element, memory));
    };

    return (
        <button type="button" className={className} onClick={handleClick}>
            {content}
        </button>
    );
}
