import { describe, expect, it } from "vitest";
import { parseProgram } from "../../engine/schema/program.ts";
import {
    background,
    type MapElement,
    mapStatus,
    markerPosition,
    moveCrosshairs,
    sectorName,
} from "./definition.ts";

const map = (props: object = {}, variables: object = { sx: 3 }) => {
    const result = parseProgram({
        config: { name: "T", variables },
        screens: { home: { content: [{ type: "map", ...props }] } },
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.program.screens.get("home")?.content[0] as unknown as MapElement;
};

describe("a map", () => {
    it("is its grid, padded to one width, or a star field that's the same each time", () => {
        expect(background(map({ grid: ["AB", "C"] }))).toEqual(["AB", "C "]);
        const stars = background(map({ cols: 20, rows: 5 }));
        expect(stars).toHaveLength(5);
        expect(stars.every((line) => line.length === 20)).toBe(true);
        expect(stars.join("")).toMatch(/[·.]/);
        expect(background(map({ cols: 20, rows: 5 }))).toEqual(stars);
    });

    it("names sectors, and marks where they meet", () => {
        const sectored = map({ cols: 24, rows: 8, sectors: [12, 4], stars: 0 });
        expect(sectorName(sectored, 0, 0)).toBe("A1");
        expect(sectorName(sectored, 13, 5)).toBe("B2");
        expect(background(sectored)[4]?.[12]).toBe("+");
        expect(
            mapStatus(
                { ...sectored, status: "{sector} {x},{y} {target}" },
                { x: 13, y: 5 },
                "LV-426",
            ),
        ).toBe("B2 13,5 LV-426");
    });

    it("puts markers where they are, or where their variables say", () => {
        expect(markerPosition({ x: 2, y: 1, char: "*", blink: false }, () => 0)).toEqual({
            x: 2,
            y: 1,
        });
        expect(markerPosition({ x: "sx", y: 4, char: "*", blink: false }, () => 9)).toEqual({
            x: 9,
            y: 4,
        });
    });

    it("keeps the crosshairs on the map", () => {
        expect(moveCrosshairs("ArrowRight", false, { x: 0, y: 0 }, 10, 5)).toEqual({ x: 1, y: 0 });
        expect(moveCrosshairs("ArrowDown", true, { x: 0, y: 3 }, 10, 5)).toEqual({ x: 0, y: 4 });
        expect(moveCrosshairs("ArrowLeft", false, { x: 0, y: 0 }, 10, 5)).toEqual({ x: 0, y: 0 });
        expect(moveCrosshairs("x", false, { x: 0, y: 0 }, 10, 5)).toBeNull();
    });

    it("checks the variables markers follow", () => {
        const result = parseProgram({
            config: { name: "T", variables: { word: "A" } },
            screens: { home: { content: [{ type: "map", markers: [{ x: "word", y: "gone" }] }] } },
        });
        expect(result.ok).toBe(false);
    });
});
