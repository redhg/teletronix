import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import type { ProgressElement } from "./definition.ts";

export function ProgressView({ element, run, index }: ElementViewProps<ProgressElement>) {
    const label = `${element.label?.trim() || "Progress"}: progress bar`;
    return (
        <div className={classNames("progress", element.className)}>
            <RevealText run={run} index={index} label={label} />
        </div>
    );
}
