import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { createTimedReveal } from "../../engine/reveal/index.ts";
import { type Action, ElementBaseShape } from "../../engine/schema/common.ts";
import type { Condition } from "../../engine/schema/variables.ts";
import { mosaicShape } from "./tiles.ts";

export {
    isVideoTile,
    type Mosaic,
    type MosaicTile,
    MosaicTileSchema,
    mosaicShape,
    tilesAcross,
} from "./tiles.ts";

// A monitor of several feeds at once, e.g. a security desk's cameras: images and videos in a
// grid, each with a label and a clock, some with no signal, under a line or two of text.

export const MosaicSchema = z
    .strictObject({
        type: z.literal("mosaic"),
        ...mosaicShape(),
        cols: z
            .int()
            .min(1)
            .optional()
            .meta({
                description:
                    "Its width in character columns; its height follows. On a narrower screen, it " +
                    "shrinks to fit (default: the screen's width)",
            }),
        expand: z
            .boolean()
            .default(true)
            .meta({
                description:
                    "Can be shown over the whole window: a click (or Enter) does, or, with tiles " +
                    "that do something when clicked, its [ ⤢ ] (default: true)",
            }),
        ...ElementBaseShape,
    })
    .meta({
        description:
            "Several feeds on one monitor, e.g. a security desk's cameras: images and videos in a " +
            "grid, each with a label and a clock, some with no signal, under a line of text",
    });

export type MosaicElement = z.output<typeof MosaicSchema> & ElementIdentity;

export const mosaicModule: ModuleDefinition<MosaicElement> = {
    // (the view draws it)
    text: () => "",
    reveal: () => createTimedReveal(0),
    actions: (mosaic) =>
        mosaic.tiles.flatMap((tile): Action[] => (tile.action ? [tile.action] : [])),
    conditions: (mosaic) =>
        mosaic.tiles.flatMap((tile): Condition[] => [
            ...(tile.if ? [tile.if] : []),
            ...(typeof tile.signal === "object" ? [tile.signal] : []),
        ]),
};
