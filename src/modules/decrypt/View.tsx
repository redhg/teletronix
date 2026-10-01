import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import type { DecryptElement } from "./definition.ts";

/** The message as it decrypts. Screen readers get the message itself, not the scramble. */
export function DecryptView({ element, run, index }: ElementViewProps<DecryptElement>) {
    return (
        <div className={classNames("decrypt", element.className)}>
            <RevealText run={run} index={index} label={element.text} />
        </div>
    );
}
