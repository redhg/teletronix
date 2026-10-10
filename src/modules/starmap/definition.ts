import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { seededRandom } from "../../engine/random.ts";
import { createTimedReveal } from "../../engine/reveal/index.ts";
import { type Action, ActionSchema, ElementBaseShape } from "../../engine/schema/common.ts";
import {
    type Condition,
    ConditionSchema,
    VariableNameSchema,
} from "../../engine/schema/variables.ts";

// A star map, drawn rather than typed: stars, planets, stations and ships in a space of the
// map's own units, with routes between them and range rings round them, to pan, zoom, and
// pick a target on.

const CoordinateSchema = z
    .union([z.number(), VariableNameSchema])
    .meta({ description: "A position in the map's units, or a number variable's name" });

export const MARKER_KINDS = ["star", "planet", "station", "ship", "you"] as const;

export const StarmapMarkerSchema = z
    .strictObject({
        id: z.string().optional().meta({
            description: 'A name for routes to go through, e.g. "lv426"',
        }),
        x: CoordinateSchema.meta({
            description: "How far across, from 0 at the left, or a number variable",
        }),
        y: CoordinateSchema.meta({
            description: "How far down, from 0 at the top, or a number variable",
        }),
        kind: z
            .enum(MARKER_KINDS)
            .default("star")
            .meta({
                description:
                    'What it is, and so how it\'s drawn: "star" (a point of light), "planet" (a ' +
                    'ring), "station" (a square), "ship" (a triangle) or "you" (a ship, filled) ' +
                    '(default: "star")',
            }),
        size: z.number().min(0.5).max(3).default(1).meta({
            description: "How big (or bright) it's drawn, from 0.5 to 3 (default: 1)",
        }),
        label: z.string().optional().meta({
            description: 'Its name, shown beside it, e.g. "LV-426"; can use [alert]markup[/]',
        }),
        range: CoordinateSchema.optional().meta({
            description:
                "A ring round it, this far out in the map's units (or a number variable's), " +
                "e.g. a ship's jump range",
        }),
        blink: z.boolean().default(false).meta({ description: "Make it blink (default: false)" }),
        className: z.string().optional().meta({
            description: 'CSS classes: "alert" draws it in the alert color',
        }),
        action: ActionSchema.optional().meta({
            description: "What happens when it's selected",
        }),
        if: ConditionSchema.optional().meta({ description: "Only there while this holds" }),
    })
    .meta({ description: "Something on a star map: a star, a planet, a station, a ship, you" });

const RoutePointSchema = z
    .union([z.string(), z.tuple([z.number(), z.number()])])
    .meta({ description: "A marker's id, or a place: [x, y]" });

export const StarmapRouteSchema = z
    .strictObject({
        path: z.array(RoutePointSchema).min(2).meta({
            description: 'Where it goes: markers\' ids or places, [x, y], e.g. ["you", "lv426"]',
        }),
        dashed: z.boolean().default(false).meta({
            description: "Drawn dashed, e.g. a course not yet taken (default: false)",
        }),
        className: z.string().optional().meta({
            description: 'CSS classes: "alert" draws it in the alert color',
        }),
        if: ConditionSchema.optional().meta({ description: "Only there while this holds" }),
    })
    .meta({ description: "A line between places on a star map: a course, a jump lane" });

export const StarmapSchema = z
    .strictObject({
        type: z.literal("starmap"),
        width: z.number().positive().default(100).meta({
            description: "How wide its space is, in its own units, e.g. light years (default: 100)",
        }),
        height: z.number().positive().default(60).meta({
            description: "How tall its space is, in the same units (default: 60)",
        }),
        cols: z.int().min(10).max(200).default(60).meta({
            description: "Its width on screen, in character columns (default: 60)",
        }),
        rows: z.int().min(4).max(100).default(16).meta({
            description: "Its height on screen, in lines (default: 16)",
        }),
        stars: z
            .int()
            .min(0)
            .optional()
            .meta({
                description:
                    "How many faint background stars to scatter, the same each time (default: " +
                    "one for every 20 square units)",
            }),
        sectors: z
            .tuple([z.number().positive(), z.number().positive()])
            .optional()
            .meta({
                description:
                    "Divide it into sectors this wide and tall, in its units, e.g. [25, 20]: " +
                    "lettered across the top and numbered down the side, A1, B1…",
            }),
        markers: z.array(StarmapMarkerSchema).optional().meta({
            description: "What's on it: stars, planets, stations, ships, you",
        }),
        routes: z.array(StarmapRouteSchema).optional().meta({
            description: "Lines between places: courses, jump lanes",
        }),
        zoom: z
            .number()
            .min(1)
            .max(20)
            .default(4)
            .meta({
                description:
                    "How far in it zooms (the wheel, a pinch, + and −), as a multiple of the whole " +
                    "map; 1 for no zooming (default: 4)",
            }),
        cursor: z
            .union([z.boolean(), z.string()])
            .default(false)
            .meta({
                description:
                    "Let players pick a marker: the arrow keys go to the nearest one that way, " +
                    "a click picks one, and Enter, Space or a second click selects it. True, " +
                    "or the id of the marker it starts on (default: false)",
            }),
        variable: VariableNameSchema.optional().meta({
            description: "With cursor, a text variable that gets the selected marker's label",
        }),
        status: z
            .string()
            .optional()
            .meta({
                description:
                    "With cursor, a line under the map: {target} is the picked marker's label, " +
                    "{sector} its sector, {x} and {y} where it is, and {distance} how far it is " +
                    'from the "you" marker',
            }),
        ...ElementBaseShape,
    })
    // routes and the cursor name markers that are there
    .superRefine((map, context) => {
        const ids = new Set((map.markers ?? []).flatMap((marker) => marker.id ?? []));
        (map.routes ?? []).forEach((route, r) => {
            route.path.forEach((point, p) => {
                if (typeof point === "string" && !ids.has(point)) {
                    context.addIssue({
                        code: "custom",
                        path: ["routes", r, "path", p],
                        message: `No marker has the id "${point}"`,
                    });
                }
            });
        });
        if (typeof map.cursor === "string" && !ids.has(map.cursor)) {
            context.addIssue({
                code: "custom",
                path: ["cursor"],
                message: `No marker has the id "${map.cursor}"`,
            });
        }
    })
    .meta({
        description:
            "A star map: stars, planets, stations and ships (some moving with variables), routes " +
            "and range rings, to pan and zoom, and optionally pick a target on",
    });

export type StarmapElement = z.output<typeof StarmapSchema> & ElementIdentity;
export type StarmapMarker = z.output<typeof StarmapMarkerSchema>;

export interface Point {
    x: number;
    y: number;
}

/** A number for a string, to seed a star field so it's the same each time. */
function hash(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
}

/** A faint background star: where, how bright (0–1), and how fast it twinkles. */
export interface FieldStar extends Point {
    brightness: number;
    phase: number;
}

/** The background stars, the same each time for the same map. */
export function starField(map: StarmapElement): FieldStar[] {
    const random = seededRandom(hash(map.id));
    const count = map.stars ?? Math.round((map.width * map.height) / 20);
    return Array.from({ length: count }, () => ({
        x: random() * map.width,
        y: random() * map.height,
        brightness: 0.15 + random() ** 2 * 0.6,
        phase: random() * Math.PI * 2,
    }));
}

/** The sector a place is in, e.g. "C4": a letter across, a number down. */
export function sectorName(map: StarmapElement, at: Point): string {
    if (!map.sectors) return "";
    const [w, h] = map.sectors;
    const column = Math.min(Math.floor(at.x / w), Math.ceil(map.width / w) - 1);
    const row = Math.min(Math.floor(at.y / h), Math.ceil(map.height / h) - 1);
    return `${String.fromCharCode(65 + (Math.max(0, column) % 26))}${Math.max(0, row) + 1}`;
}

/** A number of the map's units, as shown: whole, or to one decimal place. */
export const units = (n: number) => String(Math.round(n * 10) / 10);

/** A position or range: its number, or its variable's (null if that isn't a number). */
export function resolve(value: number | string, read: (name: string) => unknown): number | null {
    const n = typeof value === "number" ? value : Number(read(value));
    return Number.isFinite(n) ? n : null;
}

/** A marker that's there now, where it is now. */
export interface PlacedMarker {
    marker: StarmapMarker;
    /** Its place in the map's list: a key that doesn't change as it moves */
    index: number;
    at: Point;
    range: number | null;
}

/** The markers there now (their conditions holding), where their variables put them. */
export function placeMarkers(
    map: StarmapElement,
    read: (name: string) => unknown,
    holds: (condition: Condition) => boolean,
): PlacedMarker[] {
    return (map.markers ?? []).flatMap((marker, index) => {
        if (marker.if && !holds(marker.if)) return [];
        const x = resolve(marker.x, read);
        const y = resolve(marker.y, read);
        if (x === null || y === null) return [];
        const range = marker.range === undefined ? null : resolve(marker.range, read);
        return [{ marker, index, at: { x, y }, range }];
    });
}

/** A route's places, through its markers' ids (dropping any not there). */
export function routePoints(path: (string | [number, number])[], placed: PlacedMarker[]): Point[] {
    return path.flatMap((point) => {
        if (Array.isArray(point)) return [{ x: point[0], y: point[1] }];
        const found = placed.find((item) => item.marker.id === point);
        return found ? [found.at] : [];
    });
}

const DIRECTIONS: Record<string, Point> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
};

/**
 * The marker to go to from one, with an arrow key: the nearest that way, within 60° of it,
 * counting one off to the side as much further (at 45°, nearly twice as far). Null when
 * there's none that way (or for another key).
 */
export function nearestThatWay(key: string, from: Point, others: PlacedMarker[]): number | null {
    const direction = DIRECTIONS[key];
    if (!direction) return null;
    let best: { index: number; score: number } | null = null;
    for (const other of others) {
        const dx = other.at.x - from.x;
        const dy = other.at.y - from.y;
        const distance = Math.hypot(dx, dy);
        if (distance === 0) continue;
        const along = (dx * direction.x + dy * direction.y) / distance;
        if (along < 0.5) continue;
        const score = distance * (1 + 3 * (1 - along));
        if (!best || score < best.score) best = { index: other.index, score };
    }
    return best?.index ?? null;
}

/** The status line, with {target}, {sector}, {x}, {y} and {distance} filled in. */
export function starmapStatus(
    map: StarmapElement,
    target: PlacedMarker | undefined,
    you: PlacedMarker | undefined,
): string {
    const at = target?.at;
    return (map.status ?? "")
        .replaceAll("{target}", target?.marker.label ?? "")
        .replaceAll("{sector}", at ? sectorName(map, at) : "")
        .replaceAll("{x}", at ? units(at.x) : "")
        .replaceAll("{y}", at ? units(at.y) : "")
        .replaceAll(
            "{distance}",
            at && you ? units(Math.hypot(at.x - you.at.x, at.y - you.at.y)) : "",
        );
}

/**
 * What part of the map is on screen: the place at its middle, and how far in (1: the whole
 * map fits). Kept so the map's edges never come further in than the screen's.
 */
export interface Camera {
    center: Point;
    zoom: number;
}

/** Screen pixels for one of the map's units, at a zoom, in a box of that size. */
export function scaleOf(map: StarmapElement, zoom: number, box: { width: number; height: number }) {
    return Math.min(box.width / map.width, box.height / map.height) * zoom;
}

/** The camera kept within bounds: zoom from 1 to the map's most, and no panning off its edges. */
export function clampCamera(
    map: StarmapElement,
    camera: Camera,
    box: { width: number; height: number },
): Camera {
    const zoom = Math.min(map.zoom, Math.max(1, camera.zoom));
    const scale = scaleOf(map, zoom, box);
    const clamp = (value: number, size: number, seen: number) => {
        // (when the whole of that side fits, it stays in the middle)
        if (seen >= size) return size / 2;
        return Math.min(size - seen / 2, Math.max(seen / 2, value));
    };
    return {
        zoom,
        center: {
            x: clamp(camera.center.x, map.width, box.width / scale),
            y: clamp(camera.center.y, map.height, box.height / scale),
        },
    };
}

/** Where a place on the map is in the box, in pixels. */
export function toScreen(
    map: StarmapElement,
    camera: Camera,
    box: { width: number; height: number },
    at: Point,
): Point {
    const scale = scaleOf(map, camera.zoom, box);
    return {
        x: box.width / 2 + (at.x - camera.center.x) * scale,
        y: box.height / 2 + (at.y - camera.center.y) * scale,
    };
}

/** Where a pixel in the box is on the map. */
export function toMap(
    map: StarmapElement,
    camera: Camera,
    box: { width: number; height: number },
    at: Point,
): Point {
    const scale = scaleOf(map, camera.zoom, box);
    return {
        x: camera.center.x + (at.x - box.width / 2) / scale,
        y: camera.center.y + (at.y - box.height / 2) / scale,
    };
}

/** The camera zoomed by a factor, keeping one pixel of the box over the same place. */
export function zoomAbout(
    map: StarmapElement,
    camera: Camera,
    box: { width: number; height: number },
    factor: number,
    pixel: Point,
): Camera {
    const before = toMap(map, camera, box, pixel);
    const zoomed = { ...camera, zoom: Math.min(map.zoom, Math.max(1, camera.zoom * factor)) };
    const after = toMap(map, zoomed, box, pixel);
    return clampCamera(
        map,
        {
            zoom: zoomed.zoom,
            center: {
                x: zoomed.center.x + before.x - after.x,
                y: zoomed.center.y + before.y - after.y,
            },
        },
        box,
    );
}

export const starmapModule: ModuleDefinition<StarmapElement> = {
    // (the view draws it)
    text: () => "",
    reveal: () => createTimedReveal(0),
    actions: (map) =>
        [
            ...(map.markers ?? []).flatMap((marker) => (marker.action ? [marker.action] : [])),
            // (so the variable is checked: it must be a text variable)
            ...(map.variable === undefined
                ? []
                : [ActionSchema.parse({ set: { [map.variable]: "" } })]),
        ] as Action[],
    conditions: (map) => [
        ...(map.markers ?? []).flatMap((marker): Condition[] => [
            ...(marker.if ? [marker.if] : []),
            // (a position or range from a variable: checked like a test of it, so it must be a
            // number)
            ...[marker.x, marker.y, marker.range]
                .filter((value): value is string => typeof value === "string")
                .map((variable) => ({ variable, atLeast: 0 })),
        ]),
        ...(map.routes ?? []).flatMap((route) => (route.if ? [route.if] : [])),
    ],
};
