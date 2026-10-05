// Makes the symbol fonts: the box-drawing lines, blocks, shades, arrows and shapes Teletronix
// draws bars, rules, tables, maps and frames with, for fonts that don't have them, each to its
// font's own measure. They're listed after their font (see src/ui/appearance.ts), so the
// browser takes from them only the characters the font lacks.
//
//   node scripts/symbols-font.ts      (writes src/assets/fonts/symbols-<font>.otf)
//
// Each symbol is drawn once, as polygons in its font's cell, then either filled as they are
// (for fonts of solid strokes, at their stroke's weight) or sampled onto the font's dot grid
// (for a dot-matrix font, so its lines are dots too). The cell is the font's own: its advance
// width, ascender and descender, so lines meet the next character's and the grid stays even.

import { writeFileSync } from "node:fs";
import opentype from "opentype.js";

type Point = [number, number];
/** A closed outline: counterclockwise fills, clockwise cuts a hole (nonzero winding). */
type Polygon = Point[];

/** How a font's cell is measured, and how its symbols are drawn. */
export interface SymbolsSpec {
    /** The font it's for (src/assets/fonts/symbols-<id>.otf) */
    id: string;
    name: string;
    unitsPerEm: number;
    /** Every character's width */
    advance: number;
    ascender: number;
    descender: number;
    /** How thick lines are */
    stroke: number;
    /** The height of box lines' centre: where the font's own "-" sits */
    middle: number;
    /** The squares shades are made of, from (x0, y0) */
    shade: { x0: number; y0: number; width: number; height: number };
    /** Solid strokes; or dots, on a grid from (x0, y0), `pitch` apart, `size` across */
    dots?: { x0: number; y0: number; pitch: number; size: number };
    /** How far edges wander, for a hand-inked look (default: not at all) */
    wobble?: number;
}

/** The fonts that need them, as measured from each font's own glyphs. */
export const SPECS: SymbolsSpec[] = [
    {
        // a pixel font: 100 units a pixel, the strokes a pixel thick
        id: "home-video",
        name: "Home Video",
        unitsPerEm: 1000,
        advance: 600,
        ascender: 800,
        descender: -100,
        stroke: 100,
        middle: 350,
        // (its symbols reach an em: from -150 to 850)
        shade: { x0: 0, y0: -150, width: 100, height: 100 },
    },
    {
        // its 7- and 16-segment styles measure the same
        id: "digit-tech",
        name: "Digit Tech",
        unitsPerEm: 1024,
        advance: 672,
        ascender: 1024,
        descender: -128,
        stroke: 84,
        middle: 448,
        shade: { x0: 0, y0: -128, width: 84, height: 1152 / 14 },
    },
    {
        // 5×7 dots, 240 apart, with a dot's gap between characters
        id: "matrixtype",
        name: "MatrixType",
        unitsPerEm: 2048,
        advance: 1440,
        ascender: 1920,
        descender: -320,
        stroke: 240,
        middle: 840,
        shade: { x0: 0, y0: -240, width: 240, height: 240 },
        dots: { x0: 20, y0: -220, pitch: 240, size: 200 },
    },
    {
        id: "x-typewriter",
        name: "X Typewriter",
        unitsPerEm: 2048,
        advance: 1200,
        ascender: 1913,
        descender: -419,
        stroke: 160,
        middle: 747,
        shade: { x0: 0, y0: -419, width: 150, height: 2332 / 16 },
        wobble: 18,
    },
];

// ─── Drawing ─────────────────────────────────────────────────────────────────

/** How far past the cell's sides (as a share of its width) its edges reach. */
const BLEED = 0.02;

/** A cell to draw in, and ways to draw in it. */
class Cell {
    readonly polygons: Polygon[] = [];
    readonly w: number;
    readonly top: number;
    readonly bottom: number;
    /** Box lines' centre, and the cell's */
    readonly mid: number;
    readonly cx: number;
    readonly cy: number;
    readonly t: number;
    readonly spec: SymbolsSpec;

    constructor(spec: SymbolsSpec) {
        this.spec = spec;
        this.w = spec.advance;
        this.cy = (spec.ascender + spec.descender) / 2;
        // at least an em tall, so lines and blocks join up from line to line when lines are
        // an em apart (config.lineSpacing 1)
        this.top = Math.max(spec.ascender, this.cy + spec.unitsPerEm / 2);
        this.bottom = Math.min(spec.descender, this.cy - spec.unitsPerEm / 2);
        this.mid = spec.middle;
        this.cx = spec.advance / 2;
        this.t = spec.stroke;
    }

    /**
     * A filled rectangle. One that reaches a side of the cell reaches a hair past it, to
     * overlap the next character's: where text lands between screen pixels, edges that only
     * meet show a seam.
     */
    rect(x1: number, y1: number, x2: number, y2: number): this {
        const bleed = this.spec.dots ? 0 : this.w * BLEED;
        let [left, right] = [Math.min(x1, x2), Math.max(x1, x2)];
        if (left <= 0) left = -bleed;
        if (right >= this.w) right = this.w + bleed;
        const [low, high] = [Math.min(y1, y2), Math.max(y1, y2)];
        this.polygons.push([
            [left, low],
            [right, low],
            [right, high],
            [left, high],
        ]);
        return this;
    }

    /** A box line across, at height y, from x1 to x2. */
    h(y: number, x1: number, x2: number): this {
        return this.rect(x1, y - this.t / 2, x2, y + this.t / 2);
    }

    /** A box line up and down, at x, from y1 to y2. */
    v(x: number, y1: number, y2: number): this {
        return this.rect(x - this.t / 2, y1, x + this.t / 2, y2);
    }

    /** A filled shape through these points (in either direction). */
    shape(points: Point[], hole = false): this {
        const area = points.reduce((sum, [x, y], i) => {
            const [nx, ny] = points[(i + 1) % points.length] as Point;
            return sum + (x * ny - nx * y);
        }, 0);
        const counterclockwise = area > 0;
        this.polygons.push(counterclockwise !== hole ? points : [...points].reverse());
        return this;
    }

    /** A filled ellipse (or a hole of one). */
    ellipse(x: number, y: number, rx: number, ry: number, hole = false): this {
        const steps = 32;
        const points = Array.from({ length: steps }, (_, i): Point => {
            const angle = (i / steps) * Math.PI * 2;
            return [x + Math.cos(angle) * rx, y + Math.sin(angle) * ry];
        });
        return this.shape(points, hole);
    }

    /** A line through these points, a stroke thick. */
    line(...points: Point[]): this {
        const half = this.t / 2;
        for (let i = 0; i < points.length - 1; i++) {
            const [x1, y1] = points[i] as Point;
            const [x2, y2] = points[i + 1] as Point;
            const length = Math.hypot(x2 - x1, y2 - y1);
            // across the line, and along it (each end reaches past by half, so joins meet)
            const [ax, ay] = [((y1 - y2) / length) * half, ((x2 - x1) / length) * half];
            const [lx, ly] = [((x2 - x1) / length) * half, ((y2 - y1) / length) * half];
            this.shape([
                [x1 - lx + ax, y1 - ly + ay],
                [x1 - lx - ax, y1 - ly - ay],
                [x2 + lx - ax, y2 + ly - ay],
                [x2 + lx + ax, y2 + ly + ay],
            ]);
        }
        return this;
    }

    /** Squares in a pattern across the whole cell, where `on(column, row)` says so. */
    pattern(on: (column: number, row: number) => boolean): this {
        const { x0, y0, width, height } = this.spec.shade;
        for (let row = 0; y0 + row * height < this.top - 1; row++) {
            for (let column = 0; x0 + column * width < this.w - 1; column++) {
                if (!on(column, row)) continue;
                const x = x0 + column * width;
                const y = y0 + row * height;
                this.rect(
                    Math.max(0, x),
                    Math.max(this.bottom, y),
                    Math.min(this.w, x + width),
                    Math.min(this.top, y + height),
                );
            }
        }
        return this;
    }
}

/** Box lines in two directions at once: the double lines' rails. */
const rails = (cell: Cell) => {
    const { t, cx, mid } = cell;
    const h = t / 2;
    return { a: cx - t, b: cx + t, p: mid - t, q: mid + t, h };
};

/** Every symbol, by character: drawn into its font's cell. */
export const SYMBOLS: Record<string, (cell: Cell) => void> = {
    // ── box lines ──
    "─": (c) => c.h(c.mid, 0, c.w),
    "│": (c) => c.v(c.cx, c.bottom, c.top),
    "┌": (c) => c.h(c.mid, c.cx - c.t / 2, c.w).v(c.cx, c.bottom, c.mid + c.t / 2),
    "┐": (c) => c.h(c.mid, 0, c.cx + c.t / 2).v(c.cx, c.bottom, c.mid + c.t / 2),
    "└": (c) => c.h(c.mid, c.cx - c.t / 2, c.w).v(c.cx, c.mid - c.t / 2, c.top),
    "┘": (c) => c.h(c.mid, 0, c.cx + c.t / 2).v(c.cx, c.mid - c.t / 2, c.top),
    "├": (c) => c.v(c.cx, c.bottom, c.top).h(c.mid, c.cx, c.w),
    "┤": (c) => c.v(c.cx, c.bottom, c.top).h(c.mid, 0, c.cx),
    "┬": (c) => c.h(c.mid, 0, c.w).v(c.cx, c.bottom, c.mid),
    "┴": (c) => c.h(c.mid, 0, c.w).v(c.cx, c.mid, c.top),
    "┼": (c) => c.h(c.mid, 0, c.w).v(c.cx, c.bottom, c.top),
    "═": (c) => {
        const { p, q } = rails(c);
        c.h(p, 0, c.w).h(q, 0, c.w);
    },
    "║": (c) => {
        const { a, b } = rails(c);
        c.v(a, c.bottom, c.top).v(b, c.bottom, c.top);
    },
    "╔": (c) => {
        const { a, b, p, q, h } = rails(c);
        c.h(q, a - h, c.w)
            .v(a, c.bottom, q + h)
            .h(p, b - h, c.w)
            .v(b, c.bottom, p + h);
    },
    "╗": (c) => {
        const { a, b, p, q, h } = rails(c);
        c.h(q, 0, b + h)
            .v(b, c.bottom, q + h)
            .h(p, 0, a + h)
            .v(a, c.bottom, p + h);
    },
    "╚": (c) => {
        const { a, b, p, q, h } = rails(c);
        c.h(p, a - h, c.w)
            .v(a, p - h, c.top)
            .h(q, b - h, c.w)
            .v(b, q - h, c.top);
    },
    "╝": (c) => {
        const { a, b, p, q, h } = rails(c);
        c.h(p, 0, b + h)
            .v(b, p - h, c.top)
            .h(q, 0, a + h)
            .v(a, q - h, c.top);
    },
    "╠": (c) => {
        const { a, b, p, q, h } = rails(c);
        c.v(a, c.bottom, c.top)
            .v(b, c.bottom, p + h)
            .v(b, q - h, c.top);
        c.h(p, b - h, c.w).h(q, b - h, c.w);
    },
    "╣": (c) => {
        const { a, b, p, q, h } = rails(c);
        c.v(b, c.bottom, c.top)
            .v(a, c.bottom, p + h)
            .v(a, q - h, c.top);
        c.h(p, 0, a + h).h(q, 0, a + h);
    },
    "╦": (c) => {
        const { a, b, p, q, h } = rails(c);
        c.h(q, 0, c.w)
            .h(p, 0, a + h)
            .h(p, b - h, c.w);
        c.v(a, c.bottom, p + h).v(b, c.bottom, p + h);
    },
    "╩": (c) => {
        const { a, b, p, q, h } = rails(c);
        c.h(p, 0, c.w)
            .h(q, 0, a + h)
            .h(q, b - h, c.w);
        c.v(a, q - h, c.top).v(b, q - h, c.top);
    },
    "╬": (c) => {
        const { a, b, p, q, h } = rails(c);
        c.h(p, 0, a + h)
            .h(p, b - h, c.w)
            .h(q, 0, a + h)
            .h(q, b - h, c.w);
        c.v(a, c.bottom, p + h)
            .v(a, q - h, c.top)
            .v(b, c.bottom, p + h)
            .v(b, q - h, c.top);
    },

    // ── blocks and shades ──
    "█": (c) => c.rect(0, c.bottom, c.w, c.top),
    "▀": (c) => c.rect(0, c.cy, c.w, c.top),
    "▄": (c) => c.rect(0, c.bottom, c.w, c.cy),
    "▌": (c) => c.rect(0, c.bottom, c.cx, c.top),
    "▐": (c) => c.rect(c.cx, c.bottom, c.w, c.top),
    "▖": (c) => c.rect(0, c.bottom, c.cx, c.cy),
    "▗": (c) => c.rect(c.cx, c.bottom, c.w, c.cy),
    "▘": (c) => c.rect(0, c.cy, c.cx, c.top),
    "▝": (c) => c.rect(c.cx, c.cy, c.w, c.top),
    "░": (c) => c.pattern((x, y) => x % 2 === 0 && y % 2 === 0),
    "▒": (c) => c.pattern((x, y) => (x + y) % 2 === 0),
    "▓": (c) => c.pattern((x, y) => !(x % 2 === 1 && y % 2 === 1)),

    // ── shapes ──
    "■": (c) => square(c, 0.3),
    "▪": (c) => square(c, 0.2),
    "□": (c) => {
        square(c, 0.3);
        const r = c.w * 0.3 - c.t;
        c.shape(
            [
                [c.cx - r, c.cy - r],
                [c.cx + r, c.cy - r],
                [c.cx + r, c.cy + r],
                [c.cx - r, c.cy + r],
            ],
            true,
        );
    },
    "●": (c) => c.ellipse(c.cx, c.cy, c.w * 0.35, c.w * 0.35),
    "•": (c) => c.ellipse(c.cx, c.cy, c.w * 0.18, c.w * 0.18),
    "○": (c) =>
        c
            .ellipse(c.cx, c.cy, c.w * 0.35, c.w * 0.35)
            .ellipse(c.cx, c.cy, c.w * 0.35 - c.t, c.w * 0.35 - c.t, true),
    "◆": (c) => diamond(c, 0.4),
    "♦": (c) => diamond(c, 0.4),
    "▲": (c) => triangle(c, "up"),
    "▼": (c) => triangle(c, "down"),
    "►": (c) => triangle(c, "right"),
    "▶": (c) => triangle(c, "right"),
    "◄": (c) => triangle(c, "left"),
    "◀": (c) => triangle(c, "left"),

    // ── arrows, notes, marks ──
    "→": (c) => arrow(c, "right"),
    "←": (c) => arrow(c, "left"),
    "↑": (c) => arrow(c, "up"),
    "↓": (c) => arrow(c, "down"),
    "♪": (c) => note(c, c.cx - c.w * 0.12),
    "♫": (c) => {
        const { w, cy } = c;
        const [x1, x2] = [w * 0.24, w * 0.7];
        c.ellipse(x1, cy - w * 0.38, w * 0.17, w * 0.12).ellipse(
            x2,
            cy - w * 0.28,
            w * 0.17,
            w * 0.12,
        );
        c.v(x1 + w * 0.13, cy - w * 0.38, cy + w * 0.5).v(
            x2 + w * 0.13,
            cy - w * 0.28,
            cy + w * 0.6,
        );
        c.line([x1 + w * 0.13, cy + w * 0.5], [x2 + w * 0.13, cy + w * 0.6]);
    },
    "›": (c) => chevron(c, 1, 0.22),
    "‹": (c) => chevron(c, -1, 0.22),
    "×": (c) => {
        const r = c.w * 0.26;
        c.line([c.cx - r, c.cy - r], [c.cx + r, c.cy + r]).line(
            [c.cx - r, c.cy + r],
            [c.cx + r, c.cy - r],
        );
    },

    // ── plain characters some fonts lack ──
    "<": (c) => chevron(c, -1, 0.34),
    ">": (c) => chevron(c, 1, 0.34),
    "[": (c) => bracket(c, -1),
    "]": (c) => bracket(c, 1),
    "^": (c) => {
        const { w, cx, mid } = c;
        c.line([w * 0.18, mid + w * 0.25], [cx, mid + w * 0.85], [w * 0.82, mid + w * 0.25]);
    },
    "{": (c) => brace(c, -1),
    "}": (c) => brace(c, 1),
};

function square(c: Cell, half: number): void {
    const r = c.w * half;
    c.rect(c.cx - r, c.cy - r, c.cx + r, c.cy + r);
}

function diamond(c: Cell, half: number): void {
    const r = c.w * half;
    c.shape([
        [c.cx, c.cy - r * 1.2],
        [c.cx + r, c.cy],
        [c.cx, c.cy + r * 1.2],
        [c.cx - r, c.cy],
    ]);
}

function triangle(c: Cell, towards: "up" | "down" | "left" | "right"): void {
    const { cx, cy, w } = c;
    const [across, along] = [w * 0.4, w * 0.36];
    const points: Record<typeof towards, Point[]> = {
        up: [
            [cx - across, cy - along],
            [cx + across, cy - along],
            [cx, cy + along],
        ],
        down: [
            [cx - across, cy + along],
            [cx + across, cy + along],
            [cx, cy - along],
        ],
        right: [
            [cx - along, cy - across],
            [cx + along, cy],
            [cx - along, cy + across],
        ],
        left: [
            [cx + along, cy - across],
            [cx - along, cy],
            [cx + along, cy + across],
        ],
    };
    c.shape(points[towards]);
}

function arrow(c: Cell, towards: "up" | "down" | "left" | "right"): void {
    const { w, cx, cy, t } = c;
    const reach = w * 0.42;
    const head = w * 0.3;
    if (towards === "left" || towards === "right") {
        const sign = towards === "right" ? 1 : -1;
        c.h(cy, cx - sign * reach, cx + sign * (reach - head / 2));
        c.shape([
            [cx + sign * reach + sign * t * 0.3, cy],
            [cx + sign * (reach - head), cy + head],
            [cx + sign * (reach - head), cy - head],
        ]);
    } else {
        const sign = towards === "up" ? 1 : -1;
        c.v(cx, cy - sign * reach * 1.4, cy + sign * (reach * 1.4 - head / 2));
        c.shape([
            [cx, cy + sign * reach * 1.4 + sign * t * 0.3],
            [cx + head, cy + sign * (reach * 1.4 - head)],
            [cx - head, cy + sign * (reach * 1.4 - head)],
        ]);
    }
}

function note(c: Cell, x: number): void {
    const { w, cy } = c;
    const stem = x + w * 0.15;
    c.ellipse(x, cy - w * 0.35, w * 0.19, w * 0.14);
    c.v(stem, cy - w * 0.35, cy + w * 0.62);
    c.line([stem, cy + w * 0.62], [stem + w * 0.3, cy + w * 0.3]);
}

function chevron(c: Cell, sign: 1 | -1, size: number): void {
    const { w, cx, mid } = c;
    const [reach, rise] = [w * size, w * size * 1.15];
    c.line(
        [cx - sign * reach, mid + rise],
        [cx + sign * reach, mid],
        [cx - sign * reach, mid - rise],
    );
}

function bracket(c: Cell, sign: 1 | -1): void {
    const { w, cx, top, bottom } = c;
    const height = top - bottom;
    const [low, high] = [bottom + height * 0.1, top - height * 0.08];
    const x = cx + sign * w * 0.12;
    const end = cx - sign * w * 0.22;
    c.v(x, low, high)
        .h(high - c.t / 2, end, x + sign * (c.t / 2))
        .h(low + c.t / 2, end, x + sign * (c.t / 2));
}

function brace(c: Cell, sign: 1 | -1): void {
    const { w, cx, mid, top, bottom } = c;
    const height = top - bottom;
    const [low, high] = [bottom + height * 0.1, top - height * 0.08];
    const x = cx + sign * w * 0.02;
    c.line(
        [cx - sign * w * 0.22, high],
        [x, high - height * 0.06],
        [x, mid + height * 0.05],
        [cx + sign * w * 0.24, mid],
        [x, mid - height * 0.05],
        [x, low + height * 0.06],
        [cx - sign * w * 0.22, low],
    );
}

// ─── Making a font ───────────────────────────────────────────────────────────

/** When the symbol fonts were first made, in seconds since 1970. */
const CREATED = Date.UTC(2026, 9, 5) / 1000;

/** A number from a seed, from -1 to 1, the same each time: for wobbles. */
const noise = (seed: number) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
};

/**
 * The outline wandering a little, every so often along each edge; but not where it meets the
 * next character, at the cell's sides, so lines and blocks still join.
 */
function wobbled(
    polygon: Polygon,
    amount: number,
    step: number,
    seed: number,
    width: number,
): Polygon {
    const out: Polygon = [];
    polygon.forEach(([x1, y1], i) => {
        const [x2, y2] = polygon[(i + 1) % polygon.length] as Point;
        const pieces = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / step));
        for (let k = 0; k < pieces; k++) {
            const f = k / pieces;
            const [x, y] = [x1 + (x2 - x1) * f, y1 + (y2 - y1) * f];
            if (x <= 0 || x >= width) {
                out.push([x, y]);
                continue;
            }
            const n = seed + out.length * 7.31;
            out.push([x + noise(n) * amount, y + noise(n + 3.7) * amount]);
        }
    });
    return out;
}

/** Whether a point is inside the polygons (nonzero winding). */
function inside(polygons: Polygon[], x: number, y: number): boolean {
    let winding = 0;
    for (const polygon of polygons) {
        polygon.forEach(([x1, y1], i) => {
            const [x2, y2] = polygon[(i + 1) % polygon.length] as Point;
            const cross = (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1);
            if (y1 <= y && y2 > y && cross > 0) winding++;
            else if (y1 > y && y2 <= y && cross < 0) winding--;
        });
    }
    return winding !== 0;
}

/** A symbol's outline, as the font draws: solid (maybe wobbling), or in dots. */
export function outline(spec: SymbolsSpec, char: string): Polygon[] {
    const cell = new Cell(spec);
    SYMBOLS[char]?.(cell);
    const { dots } = spec;
    if (!dots) {
        const seed = char.codePointAt(0) ?? 0;
        return spec.wobble
            ? cell.polygons.map((polygon, i) =>
                  wobbled(
                      polygon,
                      spec.wobble as number,
                      spec.stroke * 0.8,
                      seed * 31 + i,
                      spec.advance,
                  ),
              )
            : cell.polygons;
    }
    const out: Polygon[] = [];
    const r = dots.size / 2;
    for (let y = dots.y0 + r; y < spec.ascender; y += dots.pitch) {
        for (let x = dots.x0 + r; x < spec.advance; x += dots.pitch) {
            if (!inside(cell.polygons, x, y)) continue;
            out.push(
                Array.from({ length: 16 }, (_, i): Point => {
                    const angle = (i / 16) * Math.PI * 2;
                    return [x + Math.cos(angle) * r, y + Math.sin(angle) * r];
                }),
            );
        }
    }
    return out;
}

/** The symbol font for a font, as an OpenType file. */
export function symbolsFont(spec: SymbolsSpec): ArrayBuffer {
    const empty = new opentype.Path();
    const glyphs = [
        new opentype.Glyph({ name: ".notdef", advanceWidth: spec.advance, path: empty }),
    ];
    for (const char of Object.keys(SYMBOLS)) {
        const path = new opentype.Path();
        for (const polygon of outline(spec, char)) {
            polygon.forEach(([x, y], i) => {
                const [px, py] = [Math.round(x), Math.round(y)];
                if (i === 0) path.moveTo(px, py);
                else path.lineTo(px, py);
            });
            path.close();
        }
        const code = char.codePointAt(0) as number;
        glyphs.push(
            new opentype.Glyph({
                name: `uni${code.toString(16).toUpperCase().padStart(4, "0")}`,
                unicode: code,
                advanceWidth: spec.advance,
                path,
            }),
        );
    }
    const font = new opentype.Font({
        familyName: `Teletronix Symbols ${spec.name}`,
        styleName: "Regular",
        unitsPerEm: spec.unitsPerEm,
        // (the same as its font's, so it never changes where a line's text sits)
        ascender: spec.ascender,
        descender: spec.descender,
        // (a date of its own, rather than today's; it's "modified" today regardless)
        createdTimestamp: CREATED,
        glyphs,
    });
    return font.toArrayBuffer();
}

if (import.meta.main) {
    for (const spec of SPECS) {
        const file = new URL(`../src/assets/fonts/symbols-${spec.id}.otf`, import.meta.url);
        writeFileSync(file, Buffer.from(symbolsFont(spec)));
        console.log(`Wrote ${file.pathname}`);
    }
}
