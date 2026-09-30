import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import type { ChecklistElement } from "./definition.ts";

/** A checklist's lines. The engine draws them as they appear and their statuses arrive. */
export function ChecklistView({ element, run, index }: ElementViewProps<ChecklistElement>) {
    return (
        <div className={classNames("checklist", element.className)}>
            <RevealText run={run} index={index} />
        </div>
    );
}
