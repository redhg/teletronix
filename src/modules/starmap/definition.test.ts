import { describe, expect, it } from "vitest";
import { parseProgram } from "../../engine/schema/program.ts";
import {
    clampCamera,
    nearestThatWay,
    placeMarkers,
    routePoints,
    type StarmapElement,
    sectorName,
    starField,
    starmapStatus,
    toMap,
    toScreen,
    units,
    zoomAbout,
} from "./definition.ts";

const parse = (props: object = {}, variables: object = { sx: 30, sy: 10, reach: 12 }) =>
    parseProgram({
        config: { name: "T", variables },
        screens: { home: { content: [{ type: "starmap", ...props }] } },
    });

const starmap = (props: object = {}, variables?: object) => {
    const result = parse(props, variables);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.program.screens.get("home")?.content[0] as unknown as StarmapElement;
};

const variables: Record<string, unknown> = { sx: 30, sy: 10, reach: 12 };
const place = (map: StarmapElement, holds = true) =>
    placeMarkers(
        map,
        (name) => variables[name],
        () => holds,
    );

describe("a star map", () => {
    it("has a field of background stars, the same each time, inside it", () => {
        const map = starmap({ width: 50, height: 20 });
        const field = starField(map);
        expect(field).toHaveLength(50);
        expect(field.every((star) => star.x >= 0 && star.x < 50 && star.y < 20)).toBe(true);
        expect(starField(starmap({ width: 50, height: 20 }))).toEqual(field);
        expect(starField(starmap({ stars: 3 }))).toHaveLength(3);
    });

    it("names sectors with a letter across and a number down, the edges included", () => {
        const map = starmap({ width: 100, height: 60, sectors: [25, 20] });
        expect(sectorName(map, { x: 0, y: 0 })).toBe("A1");
        expect(sectorName(map, { x: 60, y: 45 })).toBe("C3");
        expect(sectorName(map, { x: 100, y: 60 })).toBe("D3");
        expect(sectorName(starmap(), { x: 5, y: 5 })).toBe("");
    });

    it("places its markers, following variables, and leaves out those whose if fails", () => {
        const map = starmap({
            markers: [
                { id: "you", kind: "you", x: "sx", y: "sy", range: "reach" },
                { x: 70, y: 40, label: "LV-426" },
            ],
        });
        const placed = place(map);
        expect(placed.map((item) => item.at)).toEqual([
            { x: 30, y: 10 },
            { x: 70, y: 40 },
        ]);
        expect(placed[0]?.range).toBe(12);
        expect(placed[1]?.marker.kind).toBe("star");
        expect(place(map, false)).toHaveLength(2);
        const iffy = starmap({ markers: [{ x: 1, y: 1, if: { sx: 0 } }] });
        expect(place(iffy, false)).toEqual([]);
    });

    it("draws routes through markers' ids and places", () => {
        const map = starmap({
            markers: [{ id: "a", x: 10, y: 10 }],
            routes: [{ path: ["a", [20, 5]] }],
        });
        expect(routePoints(map.routes?.[0]?.path ?? [], place(map))).toEqual([
            { x: 10, y: 10 },
            { x: 20, y: 5 },
        ]);
    });

    it("won't have a route or a cursor through a marker that isn't there", () => {
        const result = parse({
            markers: [{ id: "a", x: 1, y: 1 }],
            routes: [{ path: ["a", "b"] }],
        });
        expect(result.ok).toBe(false);
        expect(JSON.stringify(!result.ok && result.errors)).toContain(
            'No marker has the id \\"b\\"',
        );
        expect(parse({ cursor: "nowhere" }).ok).toBe(false);
        expect(parse({ markers: [{ id: "a", x: 1, y: 1 }], cursor: "a" }).ok).toBe(true);
    });

    it("goes to the nearest marker that way, not one off to the side", () => {
        const map = starmap({
            markers: [
                { x: 50, y: 30 },
                { x: 60, y: 30 },
                { x: 58, y: 22 },
                { x: 50, y: 10 },
                { x: 40, y: 31 },
            ],
        });
        const placed = place(map);
        const from = { x: 50, y: 30 };
        const others = placed.slice(1);
        expect(nearestThatWay("ArrowRight", from, others)).toBe(1);
        expect(nearestThatWay("ArrowUp", from, others)).toBe(3);
        expect(nearestThatWay("ArrowLeft", from, others)).toBe(4);
        expect(nearestThatWay("ArrowDown", from, others)).toBeNull();
        expect(nearestThatWay("Enter", from, others)).toBeNull();
    });

    it("fills in its status line: target, sector, place and distance from you", () => {
        const map = starmap({
            sectors: [50, 30],
            status: "{sector} [{x},{y}] {target} {distance} LY",
            markers: [
                { kind: "you", x: 0, y: 0 },
                { x: 30, y: 40, label: "LV-426" },
            ],
        });
        const [you, target] = place(map);
        expect(starmapStatus(map, target, you)).toBe("A2 [30,40] LV-426 50 LY");
        expect(starmapStatus(map, undefined, you)).toBe(" [,]   LY");
        expect(units(40.25)).toBe("40.3");
    });
});

describe("a star map's camera", () => {
    const map = starmap({ width: 100, height: 50, zoom: 4 });
    const box = { width: 400, height: 200 };

    it("fits the whole map at zoom 1, and goes between screen and map both ways", () => {
        const camera = { center: { x: 50, y: 25 }, zoom: 1 };
        expect(toScreen(map, camera, box, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
        expect(toScreen(map, camera, box, { x: 100, y: 50 })).toEqual({ x: 400, y: 200 });
        expect(toMap(map, camera, box, { x: 200, y: 100 })).toEqual({ x: 50, y: 25 });
    });

    it("keeps within the map's zoom, and its edges on the screen", () => {
        expect(clampCamera(map, { center: { x: 0, y: 0 }, zoom: 9 }, box)).toEqual({
            zoom: 4,
            center: { x: 12.5, y: 6.25 },
        });
        expect(clampCamera(map, { center: { x: 0, y: 0 }, zoom: 0.5 }, box)).toEqual({
            zoom: 1,
            center: { x: 50, y: 25 },
        });
    });

    it("zooms about a point, which stays where it was on the screen", () => {
        const camera = { center: { x: 50, y: 25 }, zoom: 1 };
        const pixel = { x: 300, y: 50 };
        const before = toMap(map, camera, box, pixel);
        const zoomed = zoomAbout(map, camera, box, 2, pixel);
        expect(zoomed.zoom).toBe(2);
        expect(toMap(map, zoomed, box, pixel)).toEqual(before);
    });
});
