import { useEffect, useRef, useState } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { StyledText } from "../../ui/StyledText.tsx";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal, useTerminalSnapshot } from "../../ui/terminal-context.ts";
import {
    background,
    type MapElement,
    type MapMarker,
    mapStatus,
    markerPosition,
    moveCrosshairs,
} from "./definition.ts";
import "./style.css";

/** The left edge's width, for sector numbers. */
const GUTTER = 3;

/**
 * The map, drawn a character at a time, with its markers and (if it has them) the
 * crosshairs: moved with the arrow keys or a click, selecting a marker with Enter, Space or
 * a click on it.
 */
export function MapView({ element, interactive }: ElementViewProps<MapElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    // (redrawn when variables change: markers can follow them)
    const snapshot = useTerminalSnapshot();
    void snapshot.variables;
    const box = useRef<HTMLElement>(null);

    const lines = background(element);
    const width = lines[0]?.length ?? 0;
    const height = lines.length;
    const start = typeof element.cursor === "object" ? element.cursor : { x: 0, y: 0 };
    const [at, setAt] = useState({
        x: Math.min(width - 1, start.x),
        y: Math.min(height - 1, start.y),
    });
    const [locked, setLocked] = useState<string | null>(null);
    const hasCursor = element.cursor !== false;

    // where each marker is now
    const markers = new Map<string, MapMarker>();
    for (const marker of element.markers ?? []) {
        if (marker.if && !terminal.holds(marker.if)) continue;
        const position = markerPosition(marker, (name) => terminal.variable(name));
        if (position) markers.set(`${position.x},${position.y}`, marker);
    }
    const under = markers.get(`${at.x},${at.y}`);

    const select = () => {
        if (!under) return;
        sound({ type: "select" });
        setLocked(under.label ?? "");
        if (element.variable) {
            terminal.dispatch([
                { set: [{ variable: element.variable, value: under.label ?? "" }] },
            ]);
        }
        if (under.action) terminal.dispatch(under.action);
    };

    // the crosshairs take the keyboard once the map can be used
    useEffect(() => {
        if (!hasCursor || !interactive || snapshot.dialog) return;
        if (document.activeElement instanceof HTMLInputElement) return;
        box.current?.focus({ preventScroll: true });
    }, [hasCursor, interactive, snapshot.dialog]);

    // (listeners on the element itself, kept up to date)
    const handlers = useRef({
        key: (_event: KeyboardEvent) => {},
        pointer: (_event: PointerEvent) => {},
    });
    handlers.current.key = (event) => {
        if (!hasCursor || !interactive || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            select();
            return;
        }
        const next = moveCrosshairs(event.key, event.shiftKey, at, width, height);
        if (!next) return;
        event.preventDefault();
        setAt(next);
        setLocked(null);
        sound({ type: "tick" });
    };
    handlers.current.pointer = (event) => {
        if (!hasCursor || !interactive) return;
        const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-x]");
        if (!cell) return;
        // a click on the map moves the crosshairs; it isn't a click on the screen (which skips)
        event.stopPropagation();
        const x = Number(cell.dataset.x);
        const y = Number(cell.dataset.y);
        if (x === at.x && y === at.y) select();
        else {
            setAt({ x, y });
            setLocked(null);
            sound({ type: "tick" });
        }
    };
    useEffect(() => {
        const target = box.current;
        if (!target) return;
        const onKey = (event: KeyboardEvent) => handlers.current.key(event);
        const onPointer = (event: PointerEvent) => handlers.current.pointer(event);
        target.addEventListener("keydown", onKey);
        target.addEventListener("pointerdown", onPointer);
        return () => {
            target.removeEventListener("keydown", onKey);
            target.removeEventListener("pointerdown", onPointer);
        };
    }, []);

    const sectors = element.sectors;
    const gutter = sectors ? GUTTER : 0;
    // sector letters across the top, in the middle of each sector
    const header = sectors
        ? " ".repeat(gutter) +
          Array.from({ length: width }, (_, x) =>
              x % sectors[0] === Math.floor(sectors[0] / 2)
                  ? String.fromCharCode(65 + (Math.floor(x / sectors[0]) % 26))
                  : " ",
          ).join("")
        : null;

    const target = under?.label ?? "";
    return (
        <section
            ref={box}
            className={classNames("map", hasCursor && "map-cursor-on", element.className)}
            // (focusable, so the arrow keys move the crosshairs)
            tabIndex={hasCursor ? 0 : undefined}
            aria-label="Map"
        >
            <div aria-hidden="true">
                {header && <div className="map-row">{header}</div>}
                {lines.map((line, y) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a map's rows never move
                    <div key={y} className="map-row">
                        {sectors &&
                            (y % sectors[1] === Math.floor(sectors[1] / 2)
                                ? String(Math.floor(y / sectors[1]) + 1)
                                      .padStart(gutter - 1)
                                      .padEnd(gutter)
                                : " ".repeat(gutter))}
                        {[...line].map((char, x) => {
                            const marker = markers.get(`${x},${y}`);
                            const cursor = hasCursor && x === at.x && y === at.y;
                            const guide = hasCursor && !cursor && (x === at.x || y === at.y);
                            return (
                                <span
                                    // biome-ignore lint/suspicious/noArrayIndexKey: a map's cells never move
                                    key={x}
                                    data-x={x}
                                    data-y={y}
                                    className={
                                        classNames(
                                            marker && "map-marker",
                                            marker?.blink && "blink",
                                            marker?.className,
                                            guide && "map-guide",
                                            cursor && "map-crosshair",
                                        ) || undefined
                                    }
                                >
                                    {marker ? marker.char : char}
                                </span>
                            );
                        })}
                    </div>
                ))}
            </div>
            {hasCursor && element.status !== undefined && (
                <div className="map-status" role="status">
                    <StyledText
                        text={mapStatus(
                            element,
                            at,
                            locked !== null ? `${target} [[LOCKED]` : target,
                        )}
                    />
                </div>
            )}
        </section>
    );
}
