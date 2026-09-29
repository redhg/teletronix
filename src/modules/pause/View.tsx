import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import type { PauseElement } from "./definition.ts";

/** The line a pause shows while it waits; it goes once the player carries on. */
export function PauseView({ element, state, run, index }: ElementViewProps<PauseElement>) {
    if (state !== "active" && !run.pausedOn(element.id)) return null;
    return (
        <div className={classNames("pause", element.className)} role="status">
            <RevealText run={run} index={index} />
        </div>
    );
}
