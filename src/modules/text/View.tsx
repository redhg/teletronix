import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import type { TextElement } from "./definition.ts";
import "./style.css";

export function TextView({ element, run, index }: ElementViewProps<TextElement>) {
    return (
        <div className={classNames("text", element.className)}>
            <RevealText run={run} index={index} />
        </div>
    );
}
