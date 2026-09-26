import { z } from "zod";
import type { EffectDefinition } from "../../engine/effect.ts";

export const BloomOptionsSchema = z.strictObject({
    strength: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .meta({ description: "From 0 to 1 (default: 0.5)" }),
    radius: z
        .number()
        .min(1)
        .max(32)
        .optional()
        .meta({ description: "How far the glow spreads, in pixels (default: 8)" }),
});

export type BloomOptions = Required<z.output<typeof BloomOptionsSchema>>;

export const bloomEffect: EffectDefinition<BloomOptions> = {
    enabledByDefault: false,
    defaults: { strength: 0.5, radius: 8 },
};
