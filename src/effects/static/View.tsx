import { useLayoutEffect, useRef } from "react";
import type { EffectViewProps } from "../../ui/effect-view.ts";
import type { StaticOptions } from "./definition.ts";
import "./style.css";

/** Analog TV noise: random gray pixels on a low-resolution canvas, scaled up. */
export function StaticView({ options }: EffectViewProps<StaticOptions>) {
    const ref = useRef<HTMLCanvasElement>(null);
    const { fps, scale } = options;

    // a layout effect, so the first frame of noise is drawn before the page is painted
    useLayoutEffect(() => {
        const canvas = ref.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;

        let image = context.createImageData(1, 1);
        const resize = () => {
            canvas.width = Math.ceil(window.innerWidth / scale);
            canvas.height = Math.ceil(window.innerHeight / scale);
            image = context.createImageData(canvas.width, canvas.height);
        };
        const draw = () => {
            // one 32-bit write per pixel: opaque gray (the same value in R, G and B)
            const pixels = new Uint32Array(image.data.buffer);
            for (let i = 0; i < pixels.length; i++) {
                const value = (Math.random() * 200) | 0;
                pixels[i] = 0xff000000 | (value << 16) | (value << 8) | value;
            }
            context.putImageData(image, 0, 0);
        };

        let frame = 0;
        let last = Number.NEGATIVE_INFINITY;
        const loop = (now: number) => {
            frame = requestAnimationFrame(loop);
            if (now - last >= 1000 / fps) {
                last = now;
                draw();
            }
        };

        resize();
        draw();
        const handleResize = () => {
            resize();
            draw();
        };
        window.addEventListener("resize", handleResize);
        // with reduced motion, the noise is a still texture
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
            frame = requestAnimationFrame(loop);
        }

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("resize", handleResize);
        };
    }, [fps, scale]);

    return <canvas ref={ref} className="static" style={{ opacity: options.opacity }} />;
}
