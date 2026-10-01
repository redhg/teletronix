import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import type { RuleElement } from "./definition.ts";

/** A horizontal rule. Screen readers get its label, or nothing: it's only a divider. */
export function RuleView({ element, run, index }: ElementViewProps<RuleElement>) {
    return (
        <div className={classNames("rule", element.className)}>
            <RevealText run={run} index={index} label={element.label ?? ""} />
        </div>
    );
}
