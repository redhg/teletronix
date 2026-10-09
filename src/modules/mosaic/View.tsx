import type { View } from "../../engine/index.ts";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import type { Mosaic, MosaicElement } from "./definition.ts";
import { MosaicGrid } from "./MosaicGrid.tsx";

/** A mosaic as a view: over the whole window. */
export const mosaicView = ({ tiles, across, aspect, overlay }: Mosaic): View => ({
    src: "",
    kind: "mosaic",
    mosaic: {
        tiles,
        aspect,
        ...(across === undefined ? {} : { across }),
        ...(overlay === undefined ? {} : { overlay }),
    },
    fit: "contain",
    loop: false,
    muted: true,
    osd: false,
});

/**
 * Several feeds on one monitor. A click on it (or Enter) shows it over the whole window; with
 * tiles that do something when clicked, those do, and its [ ⤢ ] shows it over the window.
 */
export function MosaicView({ element }: ElementViewProps<MosaicElement>) {
    const terminal = useTerminal();
    const actions = element.tiles.some((tile) => tile.action);
    const expand = () => terminal.openView(mosaicView(element));
    const grid = (
        <MosaicGrid
            mosaic={element}
            onTile={(tile) => {
                if (tile.action) terminal.dispatch(tile.action);
            }}
        />
    );
    return (
        <div
            className={classNames("mosaic", element.className)}
            style={element.cols ? { width: `${element.cols}ch` } : undefined}
        >
            {element.expand && !actions ? (
                <button
                    type="button"
                    className="mosaic-expand-all"
                    aria-label="Show the monitor over the whole screen"
                    onClick={expand}
                >
                    {grid}
                </button>
            ) : (
                grid
            )}
            {element.expand && actions && (
                <button
                    type="button"
                    className="mosaic-expand"
                    aria-label="Show the monitor over the whole screen"
                    title="Over the whole screen"
                    onClick={expand}
                >
                    [⤢]
                </button>
            )}
        </div>
    );
}
