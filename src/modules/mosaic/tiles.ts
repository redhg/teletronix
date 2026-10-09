import { z } from "zod";
import { ActionSchema } from "../../engine/schema/common.ts";
import { ConditionSchema } from "../../engine/schema/variables.ts";

// A mosaic's tiles and layout, as a mosaic element and an action's view share them. (Apart
// from the element itself: actions can show a mosaic, and its tiles have actions, so this
// file reads ActionSchema only when asked, in a getter, whichever of the two loads first.)

const VIDEO = /\.(mp4|m4v|webm|ogv|mov)(\?.*)?$/i;

export const MosaicTileSchema = z
    .strictObject({
        src: z
            .string()
            .min(1)
            .optional()
            .meta({
                description:
                    'An image or video, relative to the page, e.g. "data/cams/hangar.mp4", or a web ' +
                    "address. Videos play muted, over and over. Without one, it has no signal.",
            }),
        kind: z.enum(["image", "video"]).optional().meta({
            description: "Whether it's an image or a video (default: from the file's extension)",
        }),
        label: z.string().optional().meta({
            description:
                'A caption in its corner, e.g. "CAM 2 · LAB" (with markup and {variables})',
        }),
        clock: z
            .union([z.literal(true), z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/)])
            .optional()
            .meta({
                description:
                    "A running clock in its other corner: true for the time of day, or a time to " +
                    'start from, e.g. "03:14:07"',
            }),
        signal: z
            .union([z.boolean(), ConditionSchema])
            .default(true)
            .meta({
                description:
                    "Whether it has a picture: false for NO SIGNAL, or a condition, e.g. " +
                    '{ "cameraFixed": true }, to have one only while it holds (default: true)',
            }),
        static: z
            .union([z.boolean(), z.number().min(0).max(1)])
            .default(false)
            .meta({
                description:
                    "Static: with no signal, moving static behind NO SIGNAL (rather than a dark " +
                    "tile); with a picture, interference over it, true or a strength from 0 to 1 " +
                    "(default: false)",
            }),
        // (a getter: actions can show a mosaic, so the two refer to each other)
        get action() {
            return ActionSchema.optional().meta({
                description: "What happens when it's clicked (or chosen with Enter)",
            });
        },
        if: ConditionSchema.optional().meta({
            description: "Only there while this holds (its place stays, dark)",
        }),
    })
    .meta({
        // named, so the JSON Schema can refer to it from inside itself (its action can show a
        // mosaic)
        id: "MosaicTile",
        description: "A feed in a mosaic: an image, a video, or static",
    });

export type MosaicTile = z.output<typeof MosaicTileSchema>;

/** Text over a whole mosaic. */
export const MosaicOverlaySchema = z
    .strictObject({
        top: z.string().optional().meta({ description: "A line across the top" }),
        bottom: z.string().optional().meta({ description: "A line across the bottom" }),
    })
    .meta({
        description:
            "Text over the whole mosaic, as a monitor's on-screen display, e.g. " +
            '{ "top": "SECURITY MONITOR", "bottom": "[alert blink]● REC[/]" } (with markup ' +
            "and {variables})",
    });

/**
 * A mosaic's settings, as an element and as a view share them: made afresh for each, so the
 * JSON Schema doesn't take a shared one for a type of its own.
 */
export const mosaicShape = () => ({
    tiles: z.array(MosaicTileSchema).min(1).meta({ description: "The feeds, row by row" }),
    across: z.int().min(1).max(8).optional().meta({
        description: "How many tiles in a row (default: as square a grid as they make)",
    }),
    aspect: z
        .string()
        .regex(/^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/)
        .default("4 / 3")
        .meta({ description: 'Each tile\'s shape, width / height (default: "4 / 3")' }),
    overlay: MosaicOverlaySchema.optional(),
});

/** A mosaic as a view shows it, over the whole window. */
export const MosaicViewSchema = z.strictObject(mosaicShape()).meta({
    id: "MosaicView",
    description:
        "Several feeds at once, in place of src, as a mosaic element shows them: " +
        '{ "tiles": [ … ], "across": 2, "overlay": { … } }',
});

/** A mosaic as shown (as an element or a view): its tiles and how they're laid out. */
export interface Mosaic {
    tiles: MosaicTile[];
    across?: number;
    aspect: string;
    overlay?: { top?: string; bottom?: string };
}

/** Whether a tile shows a video, rather than an image. */
export const isVideoTile = (tile: MosaicTile) =>
    tile.kind === "video" || (tile.kind === undefined && VIDEO.test(tile.src ?? ""));

/** How many tiles across, for a number of tiles: as square a grid as they make. */
export const tilesAcross = (mosaic: Mosaic) =>
    mosaic.across ?? Math.max(1, Math.ceil(Math.sqrt(mosaic.tiles.length)));
