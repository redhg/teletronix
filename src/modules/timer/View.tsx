import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import type { TimerElement } from "./definition.ts";

/** A timer's label and time. The engine redraws it as the seconds tick. */
export function TimerView({ element, run, index }: ElementViewProps<TimerElement>) {
    return (
        <div className={classNames("timer", element.className)} role="timer">
            <RevealText run={run} index={index} />
        </div>
    );
}
