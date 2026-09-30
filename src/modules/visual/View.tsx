import { useContext, useEffect, useRef } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { PaletteContext } from "../../ui/palette-context.ts";
import { type VisualElement, visualAlt, WARM_UP } from "./definition.ts";
import { VisualPainter } from "./painter.ts";
import "./style.css";

/** Seconds in, for the one still frame drawn with reduced motion. */
const STILL = 1.7;

/**
 * A canvas the size of so many characters, drawn every animation frame while it's in view.
 * With reduced motion it's one still frame.
 */
export function VisualView({ element, state }: ElementViewProps<VisualElement>) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const palette = useContext(PaletteContext);

    useEffect(() => {
        const target = canvas.current;
        const context = target?.getContext("2d");
        if (!target || !context) return;
        void palette; // redraw in new colors when the theme changes
        const painter = new VisualPainter(element);
        const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
        // (the canvas's color is the element's: the screen's, or the alert color with "alert")
        let color = getComputedStyle(target).color;
        let scale = 1;
        const started = performance.now();
        const draw = (now: number) =>
            painter.draw(
                context,
                still ? STILL : ((now - started) / 1000) * element.speed,
                color,
                scale,
            );

        const resize = () => {
            scale = window.devicePixelRatio || 1;
            target.width = Math.max(1, Math.round(target.clientWidth * scale));
            target.height = Math.max(1, Math.round(target.clientHeight * scale));
            color = getComputedStyle(target).color;
            draw(performance.now());
        };
        const sizes = new ResizeObserver(resize);
        sizes.observe(target);
        resize();
        if (still) return () => sizes.disconnect();

        // only while it can be seen
        let frame = 0;
        let visible = true;
        const loop = (now: number) => {
            draw(now);
            frame = requestAnimationFrame(loop);
        };
        const sight = new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? true;
            cancelAnimationFrame(frame);
            if (visible) frame = requestAnimationFrame(loop);
        });
        sight.observe(target);
        frame = requestAnimationFrame(loop);
        return () => {
            cancelAnimationFrame(frame);
            sizes.disconnect();
            sight.disconnect();
        };
    }, [element, palette]);

    return (
        <div className={classNames("visual", element.className)}>
            <canvas
                ref={canvas}
                role="img"
                aria-label={visualAlt(element)}
                className={state === "active" ? "warming" : undefined}
                style={{
                    width: element.cols ? `min(${element.cols}ch, 100%)` : "100%",
                    height: `calc(${element.rows} * var(--line-height))`,
                    animationDuration: `${WARM_UP}ms`,
                }}
            />
        </div>
    );
}
