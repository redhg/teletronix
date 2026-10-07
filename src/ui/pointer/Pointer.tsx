import { useEffect, useLayoutEffect, useRef } from "react";
import type { Palette, PointerSetting } from "../../engine/index.ts";
import { themePointers } from "./art.ts";
import "./pointer.css";

/** Whether the device has a mouse (or the like) to point with: no pointer on a touch screen. */
const hasMouse = () => {
    try {
        return matchMedia("(hover: hover) and (pointer: fine)").matches;
    } catch {
        return false;
    }
};

/**
 * The mouse pointer, as the program (or screen) says: the browser's own, a pixel arrow in the
 * theme's colors, an image, hidden, or one drawn over the screen: a block that jumps from
 * character cell to cell (as a mouse did in DOS), or a crosshair across the whole screen.
 * Clicks go through to what's under it, as usual.
 */
export function Pointer({ pointer, palette }: { pointer: PointerSetting; palette: Palette }) {
    const kind = typeof pointer === "object" ? "image" : pointer;
    const active = kind !== "system" && hasMouse();

    // the browser's pointer: replaced, or hidden for one drawn here
    useLayoutEffect(() => {
        const root = document.documentElement;
        if (!active) return;
        let cursor = "none";
        let hand = "";
        if (kind === "theme") {
            const drawn = themePointers(palette.fg, palette.bg);
            if (!drawn) return;
            cursor = drawn.arrow;
            hand = drawn.hand;
        } else if (typeof pointer === "object") {
            cursor = `url(${JSON.stringify(pointer.src)}) ${pointer.x} ${pointer.y}, auto`;
        }
        root.dataset.pointer = kind;
        root.style.setProperty("--pointer", cursor);
        if (hand) root.style.setProperty("--pointer-hand", hand);
        return () => {
            delete root.dataset.pointer;
            root.style.removeProperty("--pointer");
            root.style.removeProperty("--pointer-hand");
        };
    }, [active, kind, pointer, palette]);

    if (!active || (kind !== "block" && kind !== "crosshair")) return null;
    return kind === "block" ? <BlockPointer /> : <Crosshair />;
}

/** Moves `element` with the mouse, hiding it while the mouse is away (or a touch). */
function useFollow(place: (x: number, y: number) => void, show: (on: boolean) => void) {
    useEffect(() => {
        const move = (event: PointerEvent) => {
            if (event.pointerType === "touch") return;
            place(event.clientX, event.clientY);
            show(true);
        };
        const leave = () => show(false);
        window.addEventListener("pointermove", move);
        document.documentElement.addEventListener("pointerleave", leave);
        return () => {
            window.removeEventListener("pointermove", move);
            document.documentElement.removeEventListener("pointerleave", leave);
        };
    }, [place, show]);
}

/** An inverted character cell under the mouse, snapping to the screen's columns and lines. */
function BlockPointer() {
    const block = useRef<HTMLDivElement>(null);
    // the cell's size, and where the screen's grid starts (measured when needed)
    const grid = useRef<{ width: number; height: number } | null>(null);
    const place = useRef((x: number, y: number) => {
        const element = block.current;
        const terminal = document.querySelector<HTMLElement>(".terminal");
        if (!element || !terminal) return;
        if (!grid.current) {
            const probe = document.createElement("span");
            probe.textContent = "0".repeat(100);
            probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
            terminal.append(probe);
            const width = probe.getBoundingClientRect().width / 100;
            probe.remove();
            const height = Number.parseFloat(getComputedStyle(terminal).lineHeight);
            if (!(width > 0) || !(height > 0)) return;
            grid.current = { width, height };
            element.style.width = `${width}px`;
            element.style.height = `${height}px`;
        }
        const { width, height } = grid.current;
        const box = terminal.getBoundingClientRect();
        const style = getComputedStyle(terminal);
        const left = box.left + Number.parseFloat(style.paddingLeft);
        const top = box.top + Number.parseFloat(style.paddingTop);
        const column = Math.floor((x - left) / width);
        const row = Math.floor((y - top) / height);
        element.style.transform = `translate(${left + column * width}px, ${top + row * height}px)`;
    }).current;
    const show = useRef((on: boolean) => {
        if (block.current) block.current.hidden = !on;
    }).current;
    useFollow(place, show);
    // the grid changes with the window, the font and the text size
    useEffect(() => {
        const forget = () => {
            grid.current = null;
        };
        const observer = new ResizeObserver(forget);
        const terminal = document.querySelector(".terminal");
        if (terminal) observer.observe(terminal);
        return () => observer.disconnect();
    }, []);
    return <div ref={block} className="pointer-block" hidden aria-hidden="true" />;
}

/** Lines across the whole screen, crossing under the mouse. */
function Crosshair() {
    const across = useRef<HTMLDivElement>(null);
    const down = useRef<HTMLDivElement>(null);
    const place = useRef((x: number, y: number) => {
        if (across.current) across.current.style.transform = `translateY(${y}px)`;
        if (down.current) down.current.style.transform = `translateX(${x}px)`;
    }).current;
    const show = useRef((on: boolean) => {
        if (across.current) across.current.hidden = !on;
        if (down.current) down.current.hidden = !on;
    }).current;
    useFollow(place, show);
    return (
        <>
            <div ref={across} className="pointer-across" hidden aria-hidden="true" />
            <div ref={down} className="pointer-down" hidden aria-hidden="true" />
        </>
    );
}
