import { z } from "zod";
import type { EffectDefinition } from "../../engine/effect.ts";

export const FringeOptionsSchema = z
    .strictObject({
        strength: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .meta({ description: "From 0 to 1 (default: 0.6)" }),
        offset: z
            .number()
            .min(0.5)
            .max(8)
            .optional()
            .meta({ description: "How far the colors split, in pixels (default: 1)" }),
    })
    .meta({
        description: "Red and cyan fringes on text, like misaligned color guns. Off by default.",
    });

export type FringeOptions = Required<z.output<typeof FringeOptionsSchema>>;

export const fringeEffect: EffectDefinition<FringeOptions> = {
    enabledByDefault: false,
    defaults: { strength: 0.6, offset: 1 },
};
