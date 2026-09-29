import type { CSSProperties } from "react";
import { ElementList } from "../../ui/ElementList.tsx";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { type ColumnsElement, columnLayout } from "./definition.ts";
import "./style.css";

/**
 * Its contents laid out in columns, on the character grid: the engine wraps each to the
 * column width, and this places them. It re-renders with the terminal when the window's
 * width, and so the number of columns, changes.
 */
export function ColumnsView({ element, run }: ElementViewProps<ColumnsElement>) {
    const contents = run.contents(element.id);
    if (!contents) return null;
    const { count, width } = columnLayout(element, run.width);
    const rows = Math.ceil(contents.elements.length / count);
    const style = {
        gridTemplateColumns: `repeat(${count}, ${width}ch)`,
        columnGap: `${element.gap}ch`,
        // filling each column in turn needs to know how many rows there are
        ...(element.order === "down"
            ? { gridAutoFlow: "column", gridTemplateRows: `repeat(${rows}, auto)` }
            : {}),
    } as CSSProperties;

    return (
        <div className={classNames("columns", element.className)} style={style}>
            <ElementList run={contents} states={contents.states} />
        </div>
    );
}
