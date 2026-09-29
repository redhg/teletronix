import { type BlendMode, bitmapResolution, type ImageRevealType } from "./definition.ts";

const canvas = (width: number, height: number) => {
    const made = document.createElement("canvas");
    made.width = width;
    made.height = height;
    return made;
};

const context = (target: HTMLCanvasElement) => {
    const found = target.getContext("2d");
    if (!found) throw new Error("No 2D canvas");
    return found;
};

/** Ordered dithering, as old graphics modes did it: a 4×4 Bayer matrix, from 0 to 15. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The color depths "depth" steps through: gray levels, then levels per channel. */
const DEPTHS = [
    { levels: 2, gray: true }, // 1-bit
    { levels: 2, gray: false }, // 8 colors
    { levels: 4, gray: false }, // 64 colors
    { levels: 8, gray: false }, // 512 colors
];

/**
 * Draws an image's reveal effect, frame by frame, onto a canvas the image's size. It keeps
 * what the effects work from (a dissolve's order, a depth's dithered images) between frames.
 */
export class ImageRevealer {
    private readonly width: number;
    private readonly height: number;
    private readonly frame: HTMLCanvasElement;
    private readonly blended: HTMLCanvasElement;
    private small: HTMLCanvasElement | null = null;
    private dissolve: {
        cell: number;
        mask: HTMLCanvasElement;
        pixels: ImageData;
        order: number[];
        shown: number;
    } | null = null;
    private depths: (HTMLCanvasElement | null)[] | null = null;

    private readonly image: HTMLImageElement;

    constructor(image: HTMLImageElement) {
        this.image = image;
        this.width = image.naturalWidth;
        this.height = image.naturalHeight;
        this.frame = canvas(this.width, this.height);
        this.blended = canvas(this.width, this.height);
    }

    /**
     * Draws the effect at `progress` (0 to 1) onto `target`, blended with a backdrop color
     * if there's a blend: only where the image has appeared so far.
     */
    draw(
        target: HTMLCanvasElement,
        effect: ImageRevealType,
        progress: number,
        blend: { mode: BlendMode; backdrop: string } | undefined,
    ): void {
        const out = context(target);
        out.globalCompositeOperation = "source-over";
        out.clearRect(0, 0, this.width, this.height);
        if (progress <= 0) return;

        const done = progress >= 1 || effect === "instant";
        const source = done ? this.image : this.render(effect, progress);
        const shown = done ? this.image : source;

        if (blend) {
            const mixed = context(this.blended);
            mixed.globalCompositeOperation = "source-over";
            mixed.clearRect(0, 0, this.width, this.height);
            mixed.fillStyle = blend.backdrop;
            mixed.fillRect(0, 0, this.width, this.height);
            mixed.globalCompositeOperation = blend.mode;
            mixed.drawImage(shown, 0, 0, this.width, this.height);
            mixed.globalCompositeOperation = "source-over";
            if (!done) this.cut(mixed, effect, progress);
            out.drawImage(this.blended, 0, 0);
        } else {
            out.drawImage(shown, 0, 0, this.width, this.height);
            if (!done) this.cut(out, effect, progress);
        }

        if (!done && effect === "raster") this.scanLine(out, progress);
    }

    /** The effect's picture at `progress`, before any blend. */
    private render(effect: ImageRevealType, progress: number): CanvasImageSource {
        switch (effect) {
            case "pixelate":
                return this.pixelated(bitmapResolution(progress));
            case "depth":
                return this.reduced(progress);
            case "glitch":
                return this.glitched(progress);
            default:
                // raster and dissolve show the image itself, cut to what's appeared
                return this.image;
        }
    }

    /** Clears whatever hasn't appeared yet, for the effects that reveal part by part. */
    private cut(target: CanvasRenderingContext2D, effect: ImageRevealType, progress: number) {
        if (effect === "raster") {
            const rows = Math.round(this.height * progress);
            target.clearRect(0, rows, this.width, this.height - rows);
        } else if (effect === "dissolve") {
            const mask = this.dissolved(progress);
            target.globalCompositeOperation = "destination-in";
            target.imageSmoothingEnabled = false;
            target.drawImage(mask.canvas, 0, 0, mask.width, mask.height);
            target.imageSmoothingEnabled = true;
            target.globalCompositeOperation = "source-over";
        }
    }

    /** Blocky to sharp: shrunk to `resolution`, then scaled back up without smoothing. */
    private pixelated(resolution: number): CanvasImageSource {
        this.small ??= canvas(1, 1);
        this.small.width = Math.max(1, Math.round(this.width * resolution));
        this.small.height = Math.max(1, Math.round(this.height * resolution));
        context(this.small).drawImage(this.image, 0, 0, this.small.width, this.small.height);
        const frame = context(this.frame);
        frame.clearRect(0, 0, this.width, this.height);
        frame.imageSmoothingEnabled = false;
        frame.drawImage(this.small, 0, 0, this.width, this.height);
        frame.imageSmoothingEnabled = true;
        return this.frame;
    }

    /** The bright line a raster reveal draws at its leading edge. */
    private scanLine(target: CanvasRenderingContext2D, progress: number) {
        const y = Math.round(this.height * progress);
        const thickness = Math.max(1, Math.round(this.height / 150));
        target.fillStyle = "rgb(255 255 255 / 0.7)";
        target.fillRect(0, y, this.width, thickness);
    }

    /** A mask of the specks shown so far, in random order: one mask pixel per speck. */
    private dissolved(progress: number) {
        if (!this.dissolve) {
            const cell = Math.max(1, Math.round(Math.max(this.width, this.height) / 160));
            const columns = Math.ceil(this.width / cell);
            const rows = Math.ceil(this.height / cell);
            const mask = canvas(columns, rows);
            const order = Array.from({ length: columns * rows }, (_, i) => i);
            for (let i = order.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [order[i], order[j]] = [order[j] as number, order[i] as number];
            }
            const pixels = context(mask).createImageData(columns, rows);
            this.dissolve = { cell, mask, pixels, order, shown: 0 };
        }
        const state = this.dissolve;
        const target = Math.floor(state.order.length * progress);
        for (; state.shown < target; state.shown++) {
            state.pixels.data[(state.order[state.shown] as number) * 4 + 3] = 255;
        }
        context(state.mask).putImageData(state.pixels, 0, 0);
        return {
            canvas: state.mask,
            width: state.mask.width * state.cell,
            height: state.mask.height * state.cell,
        };
    }

    /** The image at a lower color depth, dithered, stepping up as it goes. */
    private reduced(progress: number): CanvasImageSource {
        const stage = Math.min(DEPTHS.length, Math.floor(progress * (DEPTHS.length + 1)));
        if (stage >= DEPTHS.length) return this.image;
        this.depths ??= DEPTHS.map(() => null);
        const cached = this.depths[stage];
        if (cached) return cached;

        let pixels: ImageData;
        try {
            const read = canvas(this.width, this.height);
            const reader = context(read);
            reader.drawImage(this.image, 0, 0);
            pixels = reader.getImageData(0, 0, this.width, this.height);
        } catch {
            // an image from another site, without permission to read its pixels
            return this.pixelated(bitmapResolution(progress));
        }
        const { levels, gray } = DEPTHS[stage] as (typeof DEPTHS)[number];
        const data = pixels.data;
        const step = 255 / (levels - 1);
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const i = (y * this.width + x) * 4;
                const threshold = ((BAYER[(y % 4) * 4 + (x % 4)] as number) + 0.5) / 16 - 0.5;
                const quantize = (value: number) =>
                    Math.min(levels - 1, Math.max(0, Math.round(value / step + threshold))) * step;
                if (gray) {
                    const lum =
                        0.299 * (data[i] ?? 0) +
                        0.587 * (data[i + 1] ?? 0) +
                        0.114 * (data[i + 2] ?? 0);
                    const level = quantize(lum);
                    data[i] = level;
                    data[i + 1] = level;
                    data[i + 2] = level;
                } else {
                    data[i] = quantize(data[i] ?? 0);
                    data[i + 1] = quantize(data[i + 1] ?? 0);
                    data[i + 2] = quantize(data[i + 2] ?? 0);
                }
            }
        }
        const made = canvas(this.width, this.height);
        context(made).putImageData(pixels, 0, 0);
        this.depths[stage] = made;
        return made;
    }

    /** Slices of the image jumping sideways, with bars of noise, settling as it finishes. */
    private glitched(progress: number): CanvasImageSource {
        const frame = context(this.frame);
        frame.clearRect(0, 0, this.width, this.height);
        const intensity = (1 - progress) ** 1.5;
        // now and then, early on, the picture drops out altogether
        if (Math.random() < intensity * 0.25) return this.frame;

        let y = 0;
        while (y < this.height) {
            const slice = Math.max(2, Math.round(this.height * (0.02 + Math.random() * 0.12)));
            const shift =
                Math.random() < intensity
                    ? Math.round((Math.random() * 2 - 1) * intensity * this.width * 0.2)
                    : 0;
            frame.drawImage(this.image, 0, y, this.width, slice, shift, y, this.width, slice);
            y += slice;
        }
        const bars = Math.round(intensity * 6 * Math.random());
        for (let i = 0; i < bars; i++) {
            const shade = Math.round(Math.random() * 255);
            frame.fillStyle = `rgb(${shade} ${shade} ${shade} / 0.6)`;
            frame.fillRect(
                0,
                Math.random() * this.height,
                this.width,
                Math.max(1, Math.random() * this.height * 0.02),
            );
        }
        return this.frame;
    }
}
