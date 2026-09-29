import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import type { TableElement } from "./definition.ts";
import "./style.css";

/** A table: the engine lays it out as lines of text. */
export function TableView({ element, run, index }: ElementViewProps<TableElement>) {
    return (
        <div
            className={classNames(
                "table",
                element.border === "box" && "table-box",
                element.className,
            )}
        >
            <RevealText run={run} index={index} />
        </div>
    );
}
