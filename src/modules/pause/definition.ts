import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";

export const PauseSchema = z
    .strictObject({
        type: z.literal("pause"),
        text: z.string().default("-- PRESS ANY KEY TO CONTINUE --").meta({
            description: 'What it shows while waiting (default: "-- PRESS ANY KEY TO CONTINUE --")',
        }),
        align: ElementAlignSchema,
        ...ElementBaseShape,
    })
    .meta({
        description:
            "Stops the screen's reveal and shows a line of text until the player presses a key " +
            "or taps; then the line goes and the reveal carries on. Skipping stops at it too.",
    });

export type PauseElement = z.output<typeof PauseSchema> & ElementIdentity;

export const pauseModule: ModuleDefinition<PauseElement> = {
    text: (element) => element.text,
};
