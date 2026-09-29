import { z } from "zod";
import { type ElementIdentity, LOAD_FAILED, type ModuleDefinition } from "../../engine/module.ts";
import { ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";

export const TextSchema = z
    .strictObject({
        type: z.literal("text"),
        text: z
            .union([z.string(), z.array(z.string()).min(1)])
            .transform((text) => (Array.isArray(text) ? text.join("\n") : text))
            .optional()
            .meta({
                description:
                    "The text to display: a string, which may contain line breaks, or a list " +
                    "of lines (easier to read and edit for ASCII art)",
            }),
        src: z
            .string()
            .min(1)
            .optional()
            .meta({
                description:
                    "A text file to display instead, e.g. ASCII art, relative to the page " +
                    '("data/art/logo.txt"): its text is shown exactly, with no escaping needed. ' +
                    "The screen waits for it to load.",
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
    .refine((element) => (element.text === undefined) !== (element.src === undefined), {
        message: 'Give it "text" or "src" (a text file), not both',
    })
    .meta({ description: "A block of text. A bare string is shorthand for this." });

export type TextElement = z.output<typeof TextSchema> & ElementIdentity;

export const textModule: ModuleDefinition<TextElement> = {
    text: (element, _memory, _format, loaded) => {
        if (element.src === undefined) return element.text ?? "";
        if (loaded === LOAD_FAILED) return `[FILE UNAVAILABLE: ${element.src}]`;
        return typeof loaded === "string" ? loaded : "";
    },
};

/** A text file's contents, ready to show: Unix line endings, and no final line break. */
export const cleanText = (file: string) => file.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
