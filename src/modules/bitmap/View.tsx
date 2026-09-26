import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { loadImage } from "../../ui/load-image.ts";
import { type BitmapElement, bitmapResolution } from "./definition.ts";
import "./style.css";

export function BitmapView({ element, state, run, index }: ElementViewProps<BitmapElement>) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let current = true;
        loadImage(element.src).then(
            (loaded) => current && setImage(loaded),
            () => current && setFailed(true),
        );
        return () => {
            current = false;
        };
    }, [element.src]);

    // redraw at each step of the reveal, without re-rendering
    useLayoutEffect(() => {
        const target = canvas.current;
        if (!image || !target) return;
        return run.subscribeProgress(index, (progress) =>
            draw(target, image, bitmapResolution(progress)),
        );
    }, [image, run, index]);

    const className = classNames("bitmap", element.className);

    if (failed) {
        return (
            <div className={classNames(className, "alert")}>[IMAGE UNAVAILABLE: {element.alt}]</div>
        );
    }
    if (state === "unloaded" || !image) {
        return (
            <div className={classNames(className, "bitmap-loading")} role="status">
                <span className="sr-only">Loading image</span>
            </div>
        );
    }
    return (
        <div className={className}>
            <canvas
                ref={canvas}
                width={image.naturalWidth}
                height={image.naturalHeight}
                role="img"
                aria-label={element.alt}
            />
        </div>
    );
}

const scratch = typeof document === "undefined" ? null : document.createElement("canvas");

/** Draws the image pixelated to `resolution` (a fraction of full size), or nothing at 0. */
function draw(canvas: HTMLCanvasElement, image: HTMLImageElement, resolution: number) {
    const context = canvas.getContext("2d");
    if (!context) return;
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    if (resolution <= 0) return;
    if (resolution >= 1 || !scratch) {
        context.drawImage(image, 0, 0, width, height);
        return;
    }

    // shrink the image, then scale it back up without smoothing
    const small = scratch.getContext("2d");
    if (!small) return;
    scratch.width = Math.max(1, Math.round(width * resolution));
    scratch.height = Math.max(1, Math.round(height * resolution));
    small.drawImage(image, 0, 0, scratch.width, scratch.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(scratch, 0, 0, scratch.width, scratch.height, 0, 0, width, height);
}
