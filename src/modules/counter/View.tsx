import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import type { CounterElement } from "./definition.ts";

/** A counter's line. The engine redraws it as the number counts. */
export function CounterView({ element, run, index }: ElementViewProps<CounterElement>) {
    // screen readers get the finished line, not every number on the way
    const label = `${element.label}${element.to}${element.unit}${element.done}`;
    return (
        <div className={classNames("counter", element.className)}>
            <RevealText run={run} index={index} label={label} />
        </div>
    );
}
