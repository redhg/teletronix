import { z } from "zod";
import type { EffectDefinition } from "../../engine/effect.ts";

export const VignetteOptionsSchema = z.strictObject({
    strength: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .meta({ description: "From 0 to 1 (default: 0.6)" }),
});

export type VignetteOptions = Required<z.output<typeof VignetteOptionsSchema>>;

export const vignetteEffect: EffectDefinition<VignetteOptions> = {
    enabledByDefault: false,
    defaults: { strength: 0.6 },
};
