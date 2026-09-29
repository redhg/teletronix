import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";

export const TextSchema = z
    .strictObject({
        type: z.literal("text"),
        text: z
            .union([z.string(), z.array(z.string()).min(1)])
            .transform((text) => (Array.isArray(text) ? text.join("\n") : text))
            .meta({
                description:
                    "The text to display: a string, which may contain line breaks, or a list " +
                    "of lines (easier to read and edit for ASCII art)",
            }),
        wrap: z
            .boolean()
            .default(true)
            .meta({
                description:
                    "Wrap long lines to fit the screen. Set false for preformatted text such as " +
                    "ASCII art: spaces and line breaks are kept exactly, and anything past the " +
                    "right edge is cut off (default: true)",
            }),
        align: ElementAlignSchema,
        ...ElementBaseShape,
    })
    .meta({ description: "A block of text. A bare string is shorthand for this." });

export type TextElement = z.output<typeof TextSchema> & ElementIdentity;

export const textModule: ModuleDefinition<TextElement> = {
    text: (element) => element.text,
};
