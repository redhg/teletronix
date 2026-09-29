import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import type { AsciiElement } from "./definition.ts";

/** An image as text. Screen readers get its description, not the characters. */
export function AsciiView({ element, run, index }: ElementViewProps<AsciiElement>) {
    return (
        <div className={classNames("ascii", element.className)} role="img" aria-label={element.alt}>
            <RevealText run={run} index={index} label={element.alt} />
        </div>
    );
}
