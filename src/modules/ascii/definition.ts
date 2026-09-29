import { z } from "zod";
import { type ElementIdentity, LOAD_FAILED, type ModuleDefinition } from "../../engine/module.ts";
import { ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";

export const AsciiSchema = z
    .strictObject({
        type: z.literal("ascii"),
        src: z.string().min(1).meta({ description: "Image URL, or a path relative to the page" }),
        alt: z
            .string()
            .min(1)
            .meta({ description: "A description of the image, for screen readers" }),
        cols: z.int().min(4).default(60).meta({
            description:
                "Its width in characters; its height follows, keeping the image's shape (default: 60)",
        }),
        mode: z
            .enum(["shape", "ramp"])
            .default("shape")
            .meta({
                description:
                    'How characters are picked: "shape" matches each character\'s shape to the ' +
                    'picture, so edges come out as / \\ | _ and the like; "ramp" by brightness ' +
                    'alone, from " " to "@" (default: "shape")',
            }),
        contrast: z.number().min(0).max(5).default(1).meta({
            description:
                'How much "shape" sharpens edges, from 0 (not at all) up to 5 (default: 1)',
        }),
        invert: z
            .boolean()
            .default(false)
            .meta({
                description:
                    "Draw dark parts of the picture with characters, instead of bright ones: for " +
                    "dark subjects on light backgrounds (default: false)",
            }),
        align: ElementAlignSchema,
        ...ElementBaseShape,
    })
    .meta({
        description:
            "An image turned into text: each character cell picks the character that best matches " +
            "the picture there. It's real text, so it reveals like text (typed out, glitched in).",
    });

export type AsciiElement = z.output<typeof AsciiSchema> & ElementIdentity;

export const asciiModule: ModuleDefinition<AsciiElement> = {
    // the art, once the image has loaded and been converted (see ascii/convert.ts)
    text: (element, _memory, _format, loaded) => {
        if (loaded === LOAD_FAILED) return `[IMAGE UNAVAILABLE: ${element.alt}]`;
        return typeof loaded === "string" ? loaded : "";
    },
};
