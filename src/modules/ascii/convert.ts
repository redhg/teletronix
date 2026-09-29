// Turns an image into characters by shape, after Alex Harri's "ASCII rendering"
// (https://alexharri.com/blog/ascii-rendering): each character, and each cell of the
// picture, is measured in six regions, and each cell gets the character whose shape is
// closest. Images are converted once, when they load.
//
// WORK IN PROGRESS: results are recognizable only for bold, simple pictures. Ideas to try:
// the article's directional contrast (sampling just outside each cell), a gamma or
// threshold before matching, fewer candidate characters, and more regions per cell.

import type { AsciiElement } from "./definition.ts";

/** The regions' columns, as fractions of a cell's width. */
const COLUMNS = [0.3, 0.7];

/** Sample points within a region, from -1 to 1 across it each way. */
const POINTS: [number, number][] = [];
for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy <= 5) POINTS.push([dx / 2, dy / 2]);
    }
}

const CHARACTERS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
const RAMP = " .:-=+*#%@";

/** A character cell's shape on screen: the font, and the cell's height for its width. */
interface Cell {
    font: string;
    aspect: number;
}

/**
 * Where the six regions sit in a character cell: two columns by three rows, the rows
 * spread over the band letters actually use (from the top of capitals to the bottom of
 * descenders), not the whole line with its spacing. All fractions of the cell.
 */
interface Regions {
    rows: number[];
    /** A region's half-width and half-height. */
    radiusX: number;
    radiusY: number;
}

const regionCenters = (regions: Regions) =>
    regions.rows.flatMap((y) => COLUMNS.map((x) => [x, y] as const));

/** The screen's character cell, measured from the page's own text. */
function measureCell(): Cell {
    const body = getComputedStyle(document.body);
    const probe = document.createElement("span");
    probe.textContent = "0".repeat(100);
    Object.assign(probe.style, { position: "fixed", visibility: "hidden", whiteSpace: "pre" });
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width / 100;
    probe.remove();
    const lineHeight =
        Number.parseFloat(body.lineHeight) || Number.parseFloat(body.fontSize) * 1.25;
    return { font: body.fontFamily, aspect: lineHeight / width };
}

const shapes = new Map<
    string,
    { regions: Regions; glyphs: { character: string; vector: number[] }[] }
>();

/** Each character's shape: how much of each region its glyph covers, normalized. */
function characterShapes(cell: Cell) {
    const key = `${cell.font}|${cell.aspect.toFixed(3)}`;
    const cached = shapes.get(key);
    if (cached) return cached;

    const size = 40;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("No 2D canvas");
    context.font = `${size}px ${cell.font}`;
    const width = Math.ceil(context.measureText("0").width);
    const height = Math.ceil(width * cell.aspect);
    canvas.width = width;
    canvas.height = height;

    // the baseline, as the browser places it: the font's box centered in the line
    context.font = `${size}px ${cell.font}`;
    context.textBaseline = "alphabetic";
    const capital = context.measureText("M");
    const descender = context.measureText("gjpqy");
    const ascent = capital.fontBoundingBoxAscent || size * 0.8;
    const descent = capital.fontBoundingBoxDescent || size * 0.2;
    const baseline = (height - ascent - descent) / 2 + ascent;
    const top = baseline - (capital.actualBoundingBoxAscent || size * 0.7);
    // (to the baseline: only a few characters reach below it, which would outweigh the rest)
    const bottom = baseline + (descender.actualBoundingBoxDescent || size * 0.2) * 0.25;
    const band = Math.max(1, bottom - top);
    const regions: Regions = {
        rows: [1 / 6, 1 / 2, 5 / 6].map((f) => (top + band * f) / height),
        radiusX: 0.2,
        radiusY: ((band / 6) * 0.9) / height,
    };

    const raw = CHARACTERS.map((character) => {
        context.clearRect(0, 0, width, height);
        context.fillStyle = "#fff";
        context.fillText(character, 0, baseline);
        const pixels = context.getImageData(0, 0, width, height).data;
        const vector = regionCenters(regions).map(([cx, cy]) => {
            let ink = 0;
            for (const [dx, dy] of POINTS) {
                const x = Math.round((cx + dx * regions.radiusX) * width);
                const y = Math.round((cy + dy * regions.radiusY) * height);
                if (x >= 0 && x < width && y >= 0 && y < height) {
                    ink += (pixels[(y * width + x) * 4 + 3] ?? 0) / 255;
                }
            }
            return ink / POINTS.length;
        });
        return { character, vector };
    });
    // scaled together, so the densest character's densest region is full
    const most = Math.max(1e-6, ...raw.flatMap((shape) => shape.vector));
    const glyphs = raw.map(({ character, vector }) => ({
        character,
        vector: vector.map((value) => value / most),
    }));
    const measured = { regions, glyphs };
    shapes.set(key, measured);
    return measured;
}

/**
 * The picture as text, `element.cols` characters wide. Throws if its pixels can't be read
 * (an image from another site, without permission).
 */
export function imageToAscii(image: HTMLImageElement, element: AsciiElement): string {
    const cell = measureCell();
    const cols = element.cols;
    const rows = Math.max(
        1,
        Math.round((cols * image.naturalHeight) / image.naturalWidth / cell.aspect),
    );

    // the picture at 8 samples across each cell
    const across = 8;
    const down = Math.max(1, Math.round(across * cell.aspect));
    const canvas = document.createElement("canvas");
    canvas.width = cols * across;
    canvas.height = rows * down;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("No 2D canvas");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const luma = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < luma.length; i++) {
        const value =
            (0.299 * (pixels[i * 4] ?? 0) +
                0.587 * (pixels[i * 4 + 1] ?? 0) +
                0.114 * (pixels[i * 4 + 2] ?? 0)) /
            255;
        luma[i] = element.invert ? 1 - value : value;
    }
    // auto-levels: stretch the picture's own range (its darkest 2% to its brightest 2%) to
    // the full range, so a dark background comes out empty rather than faintly speckled
    const sorted = Float32Array.from(luma).sort();
    const low = sorted[Math.floor(sorted.length * 0.02)] ?? 0;
    const high = sorted[Math.floor(sorted.length * 0.98)] ?? 1;
    const range = Math.max(1e-6, high - low);
    const lightness = (x: number, y: number) => {
        const px = Math.min(canvas.width - 1, Math.max(0, Math.round(x)));
        const py = Math.min(canvas.height - 1, Math.max(0, Math.round(y)));
        return Math.min(1, Math.max(0, ((luma[py * canvas.width + px] ?? 0) - low) / range));
    };

    const { regions, glyphs } = characterShapes(cell);
    const centers = regionCenters(regions);
    const exponent = 1 + element.contrast;
    const lines: string[] = [];
    for (let row = 0; row < rows; row++) {
        let line = "";
        for (let col = 0; col < cols; col++) {
            const vector = centers.map(([cx, cy]) => {
                let sum = 0;
                for (const [dx, dy] of POINTS) {
                    sum += lightness(
                        (col + cx + dx * regions.radiusX) * across,
                        (row + cy + dy * regions.radiusY) * down,
                    );
                }
                return sum / POINTS.length;
            });
            if (element.mode === "ramp") {
                const mean = vector.reduce((a, b) => a + b, 0) / vector.length;
                line += RAMP[Math.min(RAMP.length - 1, Math.round(mean * (RAMP.length - 1)))];
                continue;
            }
            // contrast: sharpen the differences between regions, keeping the brightest
            const top = Math.max(...vector);
            const sharpened = top > 0 ? vector.map((v) => (v / top) ** exponent * top) : vector;
            let best = " ";
            let bestDistance = Number.POSITIVE_INFINITY;
            for (const { character, vector: shape } of glyphs) {
                let distance = 0;
                for (let i = 0; i < shape.length; i++) {
                    const d = (sharpened[i] ?? 0) - (shape[i] ?? 0);
                    distance += d * d;
                }
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = character;
                }
            }
            line += best;
        }
        lines.push(line.trimEnd());
    }
    // no empty rows above or below the picture (e.g. a dark border)
    while (lines.length > 1 && lines[0] === "") lines.shift();
    while (lines.length > 1 && lines.at(-1) === "") lines.pop();
    return lines.join("\n");
}
