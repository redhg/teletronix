import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { PaletteContext } from "../../ui/palette-context.ts";
import { StyledText } from "../../ui/StyledText.tsx";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal, useTerminalSnapshot } from "../../ui/terminal-context.ts";
import {
    type Camera,
    clampCamera,
    nearestThatWay,
    type PlacedMarker,
    type Point,
    placeMarkers,
    routePoints,
    type StarmapElement,
    type StarmapMarker,
    scaleOf,
    starField,
    starmapStatus,
    toScreen,
    units,
    zoomAbout,
} from "./definition.ts";
import "./style.css";

const reducedMotion = () => {
    try {
        return matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
        return false;
    }
};

/** How near (in pixels) a click must be to a marker to pick it. */
const HIT = 16;
/** How far a press must move to pan rather than click. */
const DRAG = 4;

type Box = { width: number; height: number };

/**
 * A star map, drawn on a canvas in the theme's colors, with its labels and sector names as
 * text over it. It pans (a drag, or the arrow keys without a cursor) and zooms (the wheel, a
 * pinch, + and −); with a cursor, the arrow keys go from marker to marker, and Enter, Space or
 * a second click selects one.
 */
export function StarmapView({ element, interactive }: ElementViewProps<StarmapElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    const palette = useContext(PaletteContext);
    // (redrawn when variables change: markers can follow them)
    const snapshot = useTerminalSnapshot();
    const box = useRef<HTMLElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const labels = useRef<HTMLDivElement>(null);

    const placed = placeMarkers(
        element,
        (name) => terminal.variable(name),
        (condition) => terminal.holds(condition),
    );
    const routes = (element.routes ?? []).filter((route) => !route.if || terminal.holds(route.if));
    const field = useMemo(() => starField(element), [element]);
    const hasCursor = element.cursor !== false;
    const canZoom = element.zoom > 1;

    const [size, setSize] = useState<Box>({ width: 0, height: 0 });
    const [camera, setCamera] = useState<Camera>({
        center: { x: element.width / 2, y: element.height / 2 },
        zoom: 1,
    });
    const [picked, setPicked] = useState<number | null>(() => {
        if (typeof element.cursor !== "string") return null;
        const index = (element.markers ?? []).findIndex((m) => m.id === element.cursor);
        return index < 0 ? null : index;
    });
    const [locked, setLocked] = useState(false);
    const target = placed.find((item) => item.index === picked);
    const you = placed.find((item) => item.marker.kind === "you");

    // its size on screen, as the window changes
    useLayoutEffect(() => {
        const target = box.current;
        if (!target) return;
        const measure = () => {
            const canvasBox = canvas.current?.getBoundingClientRect();
            if (canvasBox) setSize({ width: canvasBox.width, height: canvasBox.height });
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(target);
        return () => observer.disconnect();
    }, []);

    // everything the drawing reads, kept current for the animation loop
    const latest = useRef({ placed, routes, camera, size, target, locked, palette, paused: false });
    latest.current = {
        placed,
        routes,
        camera: clampCamera(element, camera, size),
        size,
        target,
        locked,
        palette,
        paused: snapshot.paused !== null,
    };
    // where each marker is drawn: gliding to where it is
    const shown = useRef(new Map<number, Point>());
    // (a change from React: drawn at the next frame, even when nothing moves)
    const redraw = useRef(() => {});
    useLayoutEffect(() => redraw.current());

    useEffect(() => {
        const target = canvas.current;
        const context = target?.getContext("2d");
        if (!target || !context) return;
        const still = reducedMotion();
        let frame = 0;
        let last = performance.now();
        let lastDrawn = 0;
        let dirty = true;
        const draw = (now: number) => {
            frame = requestAnimationFrame(draw);
            const state = latest.current;
            const { width, height } = state.size;
            if (width === 0 || height === 0) return;
            const step = Math.min(100, now - last);
            last = now;

            // markers glide to where they are
            let moving = false;
            for (const item of state.placed) {
                const at = shown.current.get(item.index);
                if (!at || still) {
                    shown.current.set(item.index, { ...item.at });
                    if (at && (at.x !== item.at.x || at.y !== item.at.y)) dirty = true;
                    continue;
                }
                const pull = 1 - Math.exp(-step / 180);
                const dx = item.at.x - at.x;
                const dy = item.at.y - at.y;
                if (Math.abs(dx) + Math.abs(dy) < 0.01) {
                    if (dx || dy) shown.current.set(item.index, { ...item.at });
                    continue;
                }
                shown.current.set(item.index, { x: at.x + dx * pull, y: at.y + dy * pull });
                moving = true;
            }
            // (still: only when something's changed; otherwise the stars twinkle, a few times a
            // second, and things blink)
            const twinkle = !still && !state.paused && now - lastDrawn > 66;
            if (!moving && !dirty && !twinkle) return;
            dirty = false;
            lastDrawn = now;
            drawMap(context, target, element, state, field, shown.current, still ? 0 : now);
            placeLabels(labels.current, element, state, shown.current);
        };
        frame = requestAnimationFrame(draw);
        redraw.current = () => {
            dirty = true;
        };
        return () => cancelAnimationFrame(frame);
    }, [element, field]);

    // ─── picking and selecting ───────────────────────────────────────────────

    /** Keeps a place in view, panning to it if it's off the screen (or near the edge). */
    const reveal = (at: Point) => {
        setCamera((current) => {
            const view = clampCamera(element, current, size);
            const pixel = toScreen(element, view, size, at);
            const margin = 24;
            const inside =
                pixel.x > margin &&
                pixel.x < size.width - margin &&
                pixel.y > margin &&
                pixel.y < size.height - margin;
            return inside ? current : clampCamera(element, { ...view, center: at }, size);
        });
    };

    const pick = (item: PlacedMarker) => {
        setPicked(item.index);
        setLocked(false);
        reveal(item.at);
        sound({ type: "tick" });
    };

    const select = () => {
        if (!target) return;
        sound({ type: "select" });
        setLocked(true);
        const label = target.marker.label ?? "";
        if (element.variable) {
            terminal.dispatch([{ set: [{ variable: element.variable, value: label }] }]);
        }
        if (target.marker.action) terminal.dispatch(target.marker.action);
    };

    /** The marker nearest a pixel in the box, within reach of a click. */
    const markerAt = (pixel: Point): PlacedMarker | undefined => {
        const view = clampCamera(element, camera, size);
        let best: { item: PlacedMarker; distance: number } | undefined;
        for (const item of placed) {
            const at = toScreen(element, view, size, item.at);
            const distance = Math.hypot(at.x - pixel.x, at.y - pixel.y);
            if (distance <= HIT && (!best || distance < best.distance)) best = { item, distance };
        }
        return best?.item;
    };

    // the map takes the keyboard once it can be used
    useEffect(() => {
        if (!(hasCursor || canZoom) || !interactive || snapshot.dialog) return;
        if (document.activeElement instanceof HTMLInputElement) return;
        box.current?.focus({ preventScroll: true });
    }, [hasCursor, canZoom, interactive, snapshot.dialog]);

    // (listeners on the element itself, kept up to date)
    const handlers = useRef({
        key: (_event: KeyboardEvent) => {},
        wheel: (_event: WheelEvent) => {},
    });
    handlers.current.key = (event) => {
        if (!interactive || event.altKey || event.ctrlKey || event.metaKey) return;
        const view = clampCamera(element, camera, size);
        const zoomBy = (factor: number) => {
            event.preventDefault();
            const middle = { x: size.width / 2, y: size.height / 2 };
            setCamera(zoomAbout(element, view, size, factor, middle));
        };
        if (canZoom && (event.key === "+" || event.key === "=")) return zoomBy(1.5);
        if (canZoom && (event.key === "-" || event.key === "_")) return zoomBy(1 / 1.5);
        if (canZoom && event.key === "0") {
            event.preventDefault();
            setCamera({ ...view, zoom: 1 });
            return;
        }
        if (hasCursor && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            select();
            return;
        }
        if (!event.key.startsWith("Arrow")) return;
        if (hasCursor) {
            event.preventDefault();
            // from the picked marker, or the middle of the screen
            const from = target?.at ?? view.center;
            const others = placed.filter((item) => item.index !== picked);
            const next = nearestThatWay(event.key, from, others);
            const item = placed.find((other) => other.index === next);
            if (item) pick(item);
            return;
        }
        if (canZoom) {
            event.preventDefault();
            const scale = scaleOf(element, view.zoom, size);
            const distance = size.width / 4 / scale;
            const moves: Record<string, Point> = {
                ArrowLeft: { x: -distance, y: 0 },
                ArrowRight: { x: distance, y: 0 },
                ArrowUp: { x: 0, y: -distance },
                ArrowDown: { x: 0, y: distance },
            };
            const move = moves[event.key] ?? { x: 0, y: 0 };
            setCamera(
                clampCamera(
                    element,
                    { ...view, center: { x: view.center.x + move.x, y: view.center.y + move.y } },
                    size,
                ),
            );
        }
    };
    handlers.current.wheel = (event) => {
        if (!interactive || !canZoom) return;
        event.preventDefault();
        const rect = canvas.current?.getBoundingClientRect();
        if (!rect) return;
        const pixel = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.002));
        setCamera((current) =>
            zoomAbout(element, clampCamera(element, current, size), size, factor, pixel),
        );
    };
    useEffect(() => {
        const target = box.current;
        const surface = canvas.current;
        if (!target || !surface) return;
        const onKey = (event: KeyboardEvent) => handlers.current.key(event);
        const onWheel = (event: WheelEvent) => handlers.current.wheel(event);
        target.addEventListener("keydown", onKey);
        // (not passive: the wheel zooms the map rather than scrolling the screen)
        surface.addEventListener("wheel", onWheel, { passive: false });
        return () => {
            target.removeEventListener("keydown", onKey);
            surface.removeEventListener("wheel", onWheel);
        };
    }, []);

    // pointers: a drag pans, two pinch, and a click picks (or, on the picked one, selects)
    const pointers = useRef(new Map<number, Point>());
    const press = useRef<{ start: Point; dragged: boolean; pinch: number | null } | null>(null);
    const local = (event: React.PointerEvent) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        // a click on the map is the map's, not the screen's (which skips the reveal)
        event.stopPropagation();
        if (!interactive) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        pointers.current.set(event.pointerId, local(event));
        press.current = { start: local(event), dragged: pointers.current.size > 1, pinch: null };
        box.current?.focus({ preventScroll: true });
    };
    const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const before = pointers.current.get(event.pointerId);
        const state = press.current;
        if (!before || !state) return;
        const now = local(event);
        pointers.current.set(event.pointerId, now);
        if (Math.hypot(now.x - state.start.x, now.y - state.start.y) > DRAG) state.dragged = true;
        if (!state.dragged || !canZoom) return;
        const view = clampCamera(element, camera, size);
        if (pointers.current.size >= 2) {
            const [a, b] = [...pointers.current.values()];
            if (!a || !b) return;
            const spread = Math.hypot(a.x - b.x, a.y - b.y);
            const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            if (state.pinch)
                setCamera(zoomAbout(element, view, size, spread / state.pinch, middle));
            state.pinch = spread;
            return;
        }
        const scale = scaleOf(element, view.zoom, size);
        setCamera(
            clampCamera(
                element,
                {
                    ...view,
                    center: {
                        x: view.center.x - (now.x - before.x) / scale,
                        y: view.center.y - (now.y - before.y) / scale,
                    },
                },
                size,
            ),
        );
    };
    const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const state = press.current;
        pointers.current.delete(event.pointerId);
        if (pointers.current.size > 0) {
            if (state) state.pinch = null;
            return;
        }
        press.current = null;
        if (!state || state.dragged || !hasCursor) return;
        const item = markerAt(local(event));
        if (!item) return;
        if (item.index === picked) select();
        else pick(item);
    };

    // (the camera as shown: kept in bounds for the box's size now)
    const view = clampCamera(element, camera, size);
    const status =
        hasCursor && element.status !== undefined
            ? starmapStatus(element, target, you) + (locked && target ? " [[LOCKED]" : "")
            : null;

    const sectorLetters = element.sectors
        ? Array.from({ length: Math.ceil(element.width / element.sectors[0]) }, (_, i) =>
              String.fromCharCode(65 + (i % 26)),
          )
        : [];
    const sectorNumbers = element.sectors
        ? Array.from({ length: Math.ceil(element.height / element.sectors[1]) }, (_, i) =>
              String(i + 1),
          )
        : [];

    return (
        <section
            ref={box}
            className={classNames("starmap", hasCursor && "starmap-cursor-on", element.className)}
            // (focusable, so the keys pick, pan and zoom)
            tabIndex={hasCursor || canZoom ? 0 : undefined}
            aria-label="Star map"
            data-zoom={Math.round(view.zoom * 100) / 100}
            data-center={`${units(view.center.x)},${units(view.center.y)}`}
            data-picked={target ? (target.marker.id ?? target.index) : undefined}
            style={{ width: `${element.cols}ch` }}
        >
            <div className="starmap-glass" style={{ height: `${element.rows}lh` }}>
                <canvas
                    ref={canvas}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                />
                <div ref={labels} className="starmap-labels" aria-hidden="true">
                    {placed.map(
                        (item) =>
                            item.marker.label && (
                                <span
                                    key={item.index}
                                    data-index={item.index}
                                    className={classNames(
                                        "starmap-label",
                                        item.marker.className,
                                        item.index === picked && "starmap-label-picked",
                                    )}
                                >
                                    <StyledText text={terminal.format(item.marker.label)} />
                                </span>
                            ),
                    )}
                    {sectorLetters.map((letter, i) => (
                        <span key={`x${letter}`} className="starmap-sector" data-column={i}>
                            {letter}
                        </span>
                    ))}
                    {sectorNumbers.map((number, i) => (
                        <span key={`y${number}`} className="starmap-sector" data-row={i}>
                            {number}
                        </span>
                    ))}
                </div>
            </div>
            {status !== null && (
                <div className="starmap-status" role="status">
                    <StyledText text={terminal.format(status)} />
                </div>
            )}
            {/* (what's on it, for a screen reader) */}
            <ul className="sr-only">
                {placed.map((item) => (
                    <li key={item.index}>
                        {describe(item.marker)}
                        {item.marker.label ? `: ${terminal.format(item.marker.label)}` : ""}
                    </li>
                ))}
            </ul>
        </section>
    );
}

const describe = (marker: StarmapMarker) =>
    marker.kind === "you" ? "You are here" : marker.kind[0]?.toUpperCase() + marker.kind.slice(1);

interface DrawState {
    placed: PlacedMarker[];
    routes: StarmapElement["routes"];
    camera: Camera;
    size: Box;
    target: PlacedMarker | undefined;
    locked: boolean;
    palette: { fg: string; bg: string; alert: string };
}

/** Draws the whole map: the stars behind, sectors, routes, rings, markers, the crosshairs. */
function drawMap(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    map: StarmapElement,
    state: DrawState,
    field: ReturnType<typeof starField>,
    shown: Map<number, Point>,
    now: number,
) {
    const { size, camera, palette } = state;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(size.width * ratio);
    const height = Math.round(size.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    const at = (point: Point) => toScreen(map, camera, size, point);
    const scale = scaleOf(map, camera.zoom, size);
    const hair = 1 / ratio;
    const colorOf = (className?: string) =>
        className?.split(/\s+/).includes("alert") ? palette.alert : palette.fg;

    // the background stars, twinkling
    context.fillStyle = palette.fg;
    const dot = Math.max(hair, Math.min(2, 0.8 * camera.zoom ** 0.4));
    for (const star of field) {
        const p = at(star);
        if (p.x < 0 || p.y < 0 || p.x > size.width || p.y > size.height) continue;
        const twinkle = now ? 0.75 + 0.25 * Math.sin(now / 700 + star.phase) : 1;
        context.globalAlpha = star.brightness * twinkle;
        context.fillRect(p.x, p.y, dot, dot);
    }

    // the map's edge, and its sectors
    context.lineWidth = hair;
    context.strokeStyle = palette.fg;
    const corner = at({ x: 0, y: 0 });
    const far = at({ x: map.width, y: map.height });
    context.globalAlpha = 0.3;
    context.strokeRect(corner.x, corner.y, far.x - corner.x, far.y - corner.y);
    if (map.sectors) {
        const [w, h] = map.sectors;
        context.globalAlpha = 0.14;
        context.setLineDash([2, 4]);
        context.beginPath();
        for (let x = w; x < map.width; x += w) {
            const p = at({ x, y: 0 });
            context.moveTo(p.x, corner.y);
            context.lineTo(p.x, far.y);
        }
        for (let y = h; y < map.height; y += h) {
            const p = at({ x: 0, y });
            context.moveTo(corner.x, p.y);
            context.lineTo(far.x, p.y);
        }
        context.stroke();
        context.setLineDash([]);
    }

    const shownAt = (item: PlacedMarker) => shown.get(item.index) ?? item.at;
    const shownPlaced = state.placed.map((item) => ({ ...item, at: shownAt(item) }));

    // routes
    context.lineWidth = Math.max(1, 1.2 * hair * ratio);
    for (const route of state.routes ?? []) {
        const points = routePoints(route.path, shownPlaced).map(at);
        if (points.length < 2) continue;
        context.strokeStyle = colorOf(route.className);
        context.globalAlpha = 0.7;
        context.setLineDash(route.dashed ? [5, 5] : []);
        context.beginPath();
        for (const [i, p] of points.entries()) {
            if (i) context.lineTo(p.x, p.y);
            else context.moveTo(p.x, p.y);
        }
        context.stroke();
    }
    context.setLineDash([]);

    // range rings
    for (const item of shownPlaced) {
        if (item.range === null || item.range <= 0) continue;
        const p = at(item.at);
        context.strokeStyle = colorOf(item.marker.className);
        context.globalAlpha = 0.45;
        context.setLineDash([3, 4]);
        context.beginPath();
        context.arc(p.x, p.y, item.range * scale, 0, Math.PI * 2);
        context.stroke();
    }
    context.setLineDash([]);

    // the crosshairs on the picked marker: faint across the map, brackets round it
    const picked = state.target && shownPlaced.find((item) => item.index === state.target?.index);
    if (picked) {
        const p = at(picked.at);
        context.strokeStyle = palette.fg;
        context.lineWidth = hair;
        context.globalAlpha = 0.22;
        context.beginPath();
        context.moveTo(0, Math.round(p.y) + 0.5 * hair);
        context.lineTo(size.width, Math.round(p.y) + 0.5 * hair);
        context.moveTo(Math.round(p.x) + 0.5 * hair, 0);
        context.lineTo(Math.round(p.x) + 0.5 * hair, size.height);
        context.stroke();
        const r = 9 + 3 * picked.marker.size;
        const arm = 4;
        const blinkOff = !state.locked && now && Math.floor(now / 500) % 2 === 1;
        context.globalAlpha = blinkOff ? 0.35 : 1;
        context.strokeStyle = colorOf(picked.marker.className);
        context.lineWidth = Math.max(1, 1.5 * hair * ratio);
        context.beginPath();
        for (const [sx, sy] of [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
        ] as const) {
            context.moveTo(p.x + sx * r, p.y + sy * (r - arm));
            context.lineTo(p.x + sx * r, p.y + sy * r);
            context.lineTo(p.x + sx * (r - arm), p.y + sy * r);
        }
        context.stroke();
    }

    // the markers
    for (const item of shownPlaced) {
        const { marker } = item;
        if (marker.blink && now && Math.floor(now / 500) % 2 === 1) continue;
        const p = at(item.at);
        const color = colorOf(marker.className);
        const s = marker.size;
        context.globalAlpha = 1;
        context.fillStyle = color;
        context.strokeStyle = color;
        context.lineWidth = Math.max(1, 1.5 * hair * ratio);
        context.shadowColor = color;
        context.shadowBlur = 6 * s;
        context.beginPath();
        switch (marker.kind) {
            case "star":
                context.arc(p.x, p.y, 1.8 * s, 0, Math.PI * 2);
                context.fill();
                break;
            case "planet":
                context.arc(p.x, p.y, 4 * s, 0, Math.PI * 2);
                context.stroke();
                break;
            case "station":
                context.rect(p.x - 3.5 * s, p.y - 3.5 * s, 7 * s, 7 * s);
                context.stroke();
                break;
            case "ship":
            case "you":
                context.moveTo(p.x, p.y - 5 * s);
                context.lineTo(p.x + 4 * s, p.y + 4 * s);
                context.lineTo(p.x - 4 * s, p.y + 4 * s);
                context.closePath();
                if (marker.kind === "you") context.fill();
                else context.stroke();
                break;
        }
        context.shadowBlur = 0;
    }
    context.globalAlpha = 1;
}

/** Puts the labels beside their markers, and the sector names along the edges. */
function placeLabels(
    layer: HTMLDivElement | null,
    map: StarmapElement,
    state: DrawState,
    shown: Map<number, Point>,
) {
    if (!layer) return;
    const { size, camera } = state;
    const at = (point: Point) => toScreen(map, camera, size, point);
    for (const label of layer.querySelectorAll<HTMLElement>(".starmap-label")) {
        const item = state.placed.find((p) => p.index === Number(label.dataset.index));
        if (!item) continue;
        const p = at(shown.get(item.index) ?? item.at);
        const inside = p.x >= 0 && p.y >= 0 && p.x <= size.width && p.y <= size.height;
        label.hidden = !inside;
        const gap = 8 + 3 * item.marker.size;
        // (on the left when there's no room on the right)
        const left = p.x + gap + label.offsetWidth > size.width;
        label.style.transform = `translate(${Math.round(left ? p.x - gap - label.offsetWidth : p.x + gap)}px, ${Math.round(p.y - label.offsetHeight / 2)}px)`;
    }
    if (!map.sectors) return;
    const [w, h] = map.sectors;
    for (const sector of layer.querySelectorAll<HTMLElement>(".starmap-sector")) {
        if (sector.dataset.column !== undefined) {
            const column = Number(sector.dataset.column);
            const x = at({ x: Math.min(map.width, (column + 0.5) * w), y: 0 }).x;
            sector.hidden = x < 0 || x > size.width;
            sector.style.transform = `translate(${Math.round(x - sector.offsetWidth / 2)}px, 0)`;
        } else {
            const row = Number(sector.dataset.row);
            const y = at({ x: 0, y: Math.min(map.height, (row + 0.5) * h) }).y;
            sector.hidden = y < 0 || y > size.height;
            sector.style.transform = `translate(0, ${Math.round(y - sector.offsetHeight / 2)}px)`;
        }
    }
}
