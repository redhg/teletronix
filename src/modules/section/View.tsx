import { useId } from "react";
import { ElementList } from "../../ui/ElementList.tsx";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import { type SectionElement, type SectionMemory, sectionOpen } from "./definition.ts";

export function SectionView({
    element,
    interactive,
    run,
    index,
}: ElementViewProps<SectionElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    const contentId = useId();
    const header = <RevealText run={run} index={index} />;
    // this re-renders whenever the terminal publishes a change, which a click causes
    const open = sectionOpen(element, terminal.recall<SectionMemory>(element.id));
    const contents = run.contents(element.id);

    return (
        <div className={classNames("section", element.className)}>
            {interactive ? (
                <button
                    type="button"
                    className="section-header control"
                    aria-expanded={open}
                    aria-controls={contents ? contentId : undefined}
                    onClick={() => {
                        sound({ type: "select" });
                        terminal.remember(element.id, !open);
                    }}
                >
                    {header}
                </button>
            ) : (
                <div className="section-header control">{header}</div>
            )}
            {/* an open section's contents show as they reveal, even before it can be clicked */}
            {contents && (
                <div
                    id={contentId}
                    className="section-content"
                    // whole character cells, matching the columns the engine gives the contents
                    style={
                        element.indent ? { paddingInlineStart: `${element.indent}ch` } : undefined
                    }
                >
                    <ElementList run={contents} states={contents.states} />
                </div>
            )}
        </div>
    );
}
