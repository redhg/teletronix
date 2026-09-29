import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { loadImage } from "../../ui/load-image.ts";
import { PaletteContext } from "../../ui/palette-context.ts";
import type { BitmapElement } from "./definition.ts";
import { ImageRevealer } from "./effects.ts";
import "./style.css";

export function BitmapView({ element, state, run, index }: ElementViewProps<BitmapElement>) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [failed, setFailed] = useState(false);
    const palette = useContext(PaletteContext);
    const mode = element.blend?.mode;
    const backdrop = element.blend?.with === "text" ? palette.fg : palette.bg;

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

    // draws the reveal effect (pixelate, unless the image sets its own)
    const revealer = useMemo(() => (image ? new ImageRevealer(image) : null), [image]);
    const effect = element.reveal?.type ?? "pixelate";

    // redraw at each step of the reveal, without re-rendering (and when the colors change)
    useLayoutEffect(() => {
        const target = canvas.current;
        if (!revealer || !target) return;
        return run.subscribeProgress(index, (progress) =>
            revealer.draw(target, effect, progress, mode && { mode, backdrop }),
        );
    }, [revealer, effect, run, index, mode, backdrop]);

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
                // character cells wide, like the text (its height follows, keeping its shape)
                style={element.cols ? { width: `${element.cols}ch` } : undefined}
            />
        </div>
    );
}
