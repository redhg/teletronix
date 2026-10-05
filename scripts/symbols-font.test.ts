import { readFileSync } from "node:fs";
import opentype from "opentype.js";
import { describe, expect, it } from "vitest";
import { outline, SPECS, SYMBOLS, symbolsFont } from "./symbols-font.ts";

const read = (id: string) => {
    const file = readFileSync(new URL(`../src/assets/fonts/symbols-${id}.otf`, import.meta.url));
    return opentype.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
};

/** A glyph's points, as the font has them. */
const points = (font: ReturnType<typeof read>, char: string) =>
    (
        font.charToGlyph(char) as unknown as {
            path: { commands: { type: string; x?: number; y?: number }[] };
        }
    ).path.commands
        .filter((command) => command.type !== "Z")
        .map((command) => [Math.round(command.x ?? 0), Math.round(command.y ?? 0)]);

describe("the symbol fonts", () => {
    it.each(SPECS.map((spec) => [spec.id, spec] as const))(
        "%s has every symbol, a cell wide, on its font's lines",
        (_, spec) => {
            const font = opentype.parse(symbolsFont(spec));
            expect([font.unitsPerEm, font.ascender, font.descender]).toEqual([
                spec.unitsPerEm,
                spec.ascender,
                spec.descender,
            ]);
            for (const char of Object.keys(SYMBOLS)) {
                expect(font.charToGlyphIndex(char), char).toBeGreaterThan(0);
                expect(font.charToGlyph(char).advanceWidth, char).toBe(spec.advance);
            }
        },
    );

    it.each(SPECS.map((spec) => [spec.id, spec] as const))(
        "%s is up to date (run node scripts/symbols-font.ts)",
        (_, spec) => {
            const committed = read(spec.id);
            const made = opentype.parse(symbolsFont(spec));
            for (const char of Object.keys(SYMBOLS)) {
                expect(points(committed, char), char).toEqual(points(made, char));
            }
        },
    );

    it("lines run the cell's whole width, a hair past, so they join the next", () => {
        const [homeVideo] = SPECS;
        if (!homeVideo) throw new Error("no fonts");
        const xs = outline(homeVideo, "─")
            .flat()
            .map(([x]) => x);
        expect(Math.min(...xs)).toBeLessThan(0);
        expect(Math.max(...xs)).toBeGreaterThan(homeVideo.advance);
    });

    it("draws a dot-matrix font's lines in its dots, on its grid", () => {
        const matrix = SPECS.find((spec) => spec.id === "matrixtype");
        if (!matrix?.dots) throw new Error("no dot-matrix font");
        const dots = outline(matrix, "─");
        // one row of dots across the cell, a pitch apart
        expect(dots).toHaveLength(matrix.advance / matrix.dots.pitch);
        const centers = dots.map((dot) => {
            const xs = dot.map(([x]) => x);
            const ys = dot.map(([, y]) => y);
            return [
                (Math.min(...xs) + Math.max(...xs)) / 2,
                (Math.min(...ys) + Math.max(...ys)) / 2,
            ];
        });
        expect(new Set(centers.map(([, y]) => Math.round(y ?? 0)))).toEqual(
            new Set([matrix.middle]),
        );
    });

    it("keeps the cell's sides straight where an inked line wobbles", () => {
        const ink = SPECS.find((spec) => spec.wobble);
        if (!ink) throw new Error("no inked font");
        const block = outline(ink, "█").flat();
        const left = block.filter(([x]) => x < 0).map(([x]) => x);
        expect(new Set(left).size).toBe(1);
    });
});
