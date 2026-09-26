import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";

export const TextSchema = z
    .strictObject({
        type: z.literal("text"),
        text: z.string().meta({ description: "The text to display. May contain line breaks." }),
        ...ElementBaseShape,
    })
    .meta({ description: "A block of text. A bare string is shorthand for this." });

export type TextElement = z.output<typeof TextSchema> & ElementIdentity;

export const textModule: ModuleDefinition<TextElement> = {
    text: (element) => element.text,
};
