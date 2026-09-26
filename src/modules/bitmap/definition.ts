import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { createTimedReveal } from "../../engine/reveal/index.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";

export const BitmapSchema = z
    .strictObject({
        type: z.literal("bitmap"),
        src: z.string().min(1).meta({ description: "Image URL, or a path relative to the page" }),
        alt: z
            .string()
            .min(1)
            .meta({ description: "A description of the image, for screen readers" }),
        ...ElementBaseShape,
    })
    .meta({
        description:
            "An image, revealed in steps from low to high resolution. A className naming a blend " +
            'mode ("luminosity", "lighten", "multiply", "screen", "overlay", …) blends it with ' +
            'the screen\'s background color; "monochrome" is short for "luminosity".',
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

/**
 * Blend modes a bitmap can take through its className, e.g. "lighten". The canvas blends
 * the image itself, over the screen's background color, rather than using CSS
 * mix-blend-mode: CSS blending breaks whenever something above the image forms an isolated
 * group (a filter such as bloom, opacity, transforms…).
 */
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

/** The blend mode named in a className, if any. "monochrome" is short for "luminosity". */
export function bitmapBlend(className: string | undefined): BlendMode | undefined {
    const names = (className ?? "")
        .split(/\s+/)
        .map((name) => (name === "monochrome" ? "luminosity" : name));
    return BLEND_MODES.find((mode) => names.includes(mode));
}

/** The resolution to draw at a given reveal progress, or 0 for nothing. */
export function bitmapResolution(progress: number): number {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    const step = Math.min(Math.floor(progress * BITMAP_STEPS.length), BITMAP_STEPS.length - 1);
    return BITMAP_STEPS[step] ?? 1;
}
