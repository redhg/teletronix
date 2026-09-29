import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { createTimedReveal } from "../../engine/reveal/index.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";

// ─── Blending ────────────────────────────────────────────────────────────────
// The canvas blends the image itself, over a fill of one of the theme's colors, rather
// than using CSS mix-blend-mode: CSS blending breaks whenever something above the image
// forms an isolated group (a filter such as bloom, opacity, transforms…).

export const BLEND_MODES = [
    "luminosity",
    "lighten",
    "darken",
    "multiply",
    "screen",
    "overlay",
    "color-dodge",
    "color-burn",
    "hard-light",
    "soft-light",
    "difference",
    "exclusion",
    "hue",
    "saturation",
    "color",
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

const BlendModeSchema = z.enum(BLEND_MODES).meta({ description: "How the colors combine" });

export const BlendObjectSchema = z
    .strictObject({
        mode: BlendModeSchema,
        with: z
            .enum(["background", "text"])
            .optional()
            .meta({ description: 'The theme color to blend with (default: "background")' }),
    })
    .meta({ description: "A blend mode, and the theme color to blend with" });

export const BlendSchema = z
    .union([BlendModeSchema, BlendObjectSchema])
    .transform((blend) =>
        typeof blend === "string"
            ? { mode: blend, with: "background" as const }
            : { mode: blend.mode, with: blend.with ?? ("background" as const) },
    )
    .meta({
        description:
            'Blends the image with one of the theme\'s colors: a mode such as "luminosity", ' +
            '"hard-light" or "difference", or { "mode", "with": "text" } to blend with the text ' +
            "color instead of the background",
    });

export type Blend = z.output<typeof BlendSchema>;

export const BitmapSchema = z
    .strictObject({
        type: z.literal("bitmap"),
        src: z.string().min(1).meta({ description: "Image URL, or a path relative to the page" }),
        alt: z
            .string()
            .min(1)
            .meta({ description: "A description of the image, for screen readers" }),
        blend: BlendSchema.optional(),
        cols: z
            .int()
            .min(1)
            .optional()
            .meta({
                description:
                    "Its width in character columns, e.g. to line it up with a line of text that " +
                    "many characters long; its height follows, keeping its shape. On a narrower " +
                    "screen, it shrinks to fit (default: the image's own width, or the screen's)",
            }),
        ...ElementBaseShape,
    })
    .meta({
        description:
            "An image, revealed in steps from low to high resolution, optionally blended with " +
            "the screen's colors",
    });

export type BitmapElement = z.output<typeof BitmapSchema> & ElementIdentity;

/** Resolutions shown while revealing, as a fraction of full size (roughly Fibonacci, as in Phosphor). */
export const BITMAP_STEPS = [0.01, 0.02, 0.03, 0.05, 0.08, 0.13, 0.21, 0.34, 0.55, 0.89, 1];
/** Time each step is shown, in ms. */
export const BITMAP_STEP_TIME = 150;

export const bitmapModule: ModuleDefinition<BitmapElement> = {
    text: () => "",
    reveal: (_element, spec) =>
        createTimedReveal(spec.type === "instant" ? 0 : BITMAP_STEPS.length * BITMAP_STEP_TIME),
};

/** The resolution to draw at a given reveal progress, or 0 for nothing. */
export function bitmapResolution(progress: number): number {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    const step = Math.min(Math.floor(progress * BITMAP_STEPS.length), BITMAP_STEPS.length - 1);
    return BITMAP_STEPS[step] ?? 1;
}
