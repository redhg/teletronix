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

const PositionSchema = z
    .union([z.int().min(0), VariableNameSchema])
    .meta({ description: "A column (or row), counting from 0, or a number variable's name" });

export const MapMarkerSchema = z
    .strictObject({
        x: PositionSchema.meta({
            description: "Its column, from 0 at the left, or a number variable",
        }),
        y: PositionSchema.meta({ description: "Its row, from 0 at the top, or a number variable" }),
        char: z
            .string()
            .length(1)
            .default("*")
            .meta({ description: 'How it\'s drawn (default: "*")' }),
        label: z.string().optional().meta({
            description: 'Its name, shown when the crosshairs are on it, e.g. "LV-426"',
        }),
        blink: z.boolean().default(false).meta({ description: "Make it blink (default: false)" }),
        className: z.string().optional().meta({ description: 'CSS classes, e.g. "alert"' }),
        action: ActionSchema.optional().meta({
            description: "What happens when it's selected with the crosshairs",
        }),
        if: ConditionSchema.optional().meta({ description: "Only there while this holds" }),
    })
    .meta({ description: "Something on a map: a star, a ship, you are here" });

export const MapPointSchema = z
    .strictObject({
        x: z.int().min(0).meta({ description: "The column, from 0 at the left" }),
        y: z.int().min(0).meta({ description: "The row, from 0 at the top" }),
    })
    .meta({ description: "A place on a map" });

export const MapSchema = z
    .strictObject({
        type: z.literal("map"),
        grid: z
            .union([z.string(), z.array(z.string()).min(1)])
            .transform((grid) => (Array.isArray(grid) ? grid : grid.split("\n")))
            .optional()
            .meta({
                description:
                    "The map, as lines of text, e.g. a deck plan (default: a star field, cols by rows)",
            }),
        cols: z.int().min(1).max(200).default(48).meta({
            description: "Without a grid, the star field's width in characters (default: 48)",
        }),
        rows: z.int().min(1).max(100).default(16).meta({
            description: "Without a grid, the star field's height in lines (default: 16)",
        }),
        stars: z
            .int()
            .min(0)
            .optional()
            .meta({
                description:
                    "Without a grid, how many faint background stars to scatter, the same each time " +
                    "(default: one for every 12 characters)",
            }),
        sectors: z
            .tuple([z.int().min(1), z.int().min(1)])
            .optional()
            .meta({
                description:
                    "Divide it into sectors this many characters wide and lines tall, e.g. [12, 4]: " +
                    "lettered across the top and numbered down the side, A1, B1…",
            }),
        markers: z.array(MapMarkerSchema).optional().meta({
            description: "What's on it: stars, ships, places, you are here",
        }),
        cursor: z
            .union([z.boolean(), MapPointSchema])
            .default(false)
            .meta({
                description:
                    "Crosshairs the player moves with the arrow keys (Shift: further) or a click, " +
                    "to select a marker with Enter, Space or a click: true, or where they start, " +
                    '{ "x", "y" } (default: false)',
            }),
        variable: VariableNameSchema.optional().meta({
            description: "With cursor, a text variable that gets the selected marker's label",
        }),
        status: z
            .string()
            .optional()
            .meta({
                description:
                    "With cursor, a line under the map: {sector} is the sector the crosshairs are " +
                    "in, {x} and {y} where they are, and {target} the label of the marker there",
            }),
        ...ElementBaseShape,
    })
    .meta({
        description:
            "A map: a deck plan or a star field, with markers (some moving with variables), and " +
            "optional crosshairs to select a target",
    });

export type MapElement = z.output<typeof MapSchema> & ElementIdentity;
export type MapMarker = z.output<typeof MapMarkerSchema>;

/** A number for a string, to seed a star field so it's the same each time. */
function hash(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
}

/** The map's background, as lines of equal length: its grid, or a star field. */
export function background(map: MapElement): string[] {
    if (map.grid) {
        const width = Math.max(...map.grid.map((line) => line.length));
        return map.grid.map((line) => line.padEnd(width));
    }
    const cells = Array.from({ length: map.rows }, () =>
        Array.from({ length: map.cols }, () => " "),
    );
    const random = seededRandom(hash(map.id));
    const count = map.stars ?? Math.round((map.cols * map.rows) / 12);
    for (let i = 0; i < count; i++) {
        const row = cells[Math.floor(random() * map.rows)];
        if (row) row[Math.floor(random() * map.cols)] = random() < 0.8 ? "·" : ".";
    }
    // faint marks where sectors meet
    if (map.sectors) {
        const [w, h] = map.sectors;
        for (let y = 0; y < map.rows; y += h) {
            for (let x = 0; x < map.cols; x += w) {
                const row = cells[y];
                if (row && (x > 0 || y > 0)) row[x] = "+";
            }
        }
    }
    return cells.map((row) => row.join(""));
}

/** The sector a cell is in, e.g. "C4": a letter across, a number down. */
export function sectorName(map: MapElement, x: number, y: number): string {
    if (!map.sectors) return "";
    const [w, h] = map.sectors;
    return `${String.fromCharCode(65 + (Math.floor(x / w) % 26))}${Math.floor(y / h) + 1}`;
}

/** Where a marker is now: its numbers, or its variables'. */
export function markerPosition(
    marker: MapMarker,
    read: (name: string) => unknown,
): { x: number; y: number } | null {
    const at = (position: number | string) =>
        typeof position === "number" ? position : Number(read(position));
    const x = at(marker.x);
    const y = at(marker.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** The crosshairs after a key press, kept on the map; null for a key that doesn't move them. */
export function moveCrosshairs(
    key: string,
    shift: boolean,
    at: { x: number; y: number },
    width: number,
    height: number,
): { x: number; y: number } | null {
    const step = shift ? 5 : 1;
    const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
    };
    const move = moves[key];
    if (!move) return null;
    return {
        x: Math.min(width - 1, Math.max(0, at.x + move[0])),
        y: Math.min(height - 1, Math.max(0, at.y + move[1])),
    };
}

/** The status line, with {sector}, {x}, {y} and {target} filled in. */
export function mapStatus(map: MapElement, at: { x: number; y: number }, target: string): string {
    return (map.status ?? "")
        .replaceAll("{sector}", sectorName(map, at.x, at.y))
        .replaceAll("{x}", String(at.x))
        .replaceAll("{y}", String(at.y))
        .replaceAll("{target}", target);
}

export const mapModule: ModuleDefinition<MapElement> = {
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
    conditions: (map) =>
        (map.markers ?? []).flatMap((marker): Condition[] => [
            ...(marker.if ? [marker.if] : []),
            // (a position from a variable: checked like a test of it, so it must be a number)
            ...[marker.x, marker.y]
                .filter((position): position is string => typeof position === "string")
                .map((variable) => ({ variable, atLeast: 0 })),
        ]),
};
