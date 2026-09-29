import { useEffect, useState } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import { useTerminal } from "../../ui/terminal-context.ts";
import { type MeterElement, meterClasses, meterValue } from "./definition.ts";

/** A gauge. The engine redraws the bar; this follows the value for its range classes. */
export function MeterView({ element, run, index }: ElementViewProps<MeterElement>) {
    const terminal = useTerminal();
    const read = () => meterValue(element, terminal.recall(element.id));
    const [value, setValue] = useState(read);
    // biome-ignore lint/correctness/useExhaustiveDependencies: read only depends on these
    useEffect(
        () => run.subscribeFrame(index, () => setValue(read())),
        [run, index, element, terminal],
    );
    const label = element.label?.trim() || "Meter";

    return (
        <div className={classNames("meter", element.className, ...meterClasses(element, value))}>
            {/* screen readers get the reading, not the bar */}
            <RevealText run={run} index={index} label={`${label}: ${value}${element.unit}`} />
        </div>
    );
}
