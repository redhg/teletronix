import { z } from "zod";
import type { EffectDefinition } from "../../engine/effect.ts";

export const FlickerOptionsSchema = z.strictObject({
    strength: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .meta({ description: "From 0 to 1 (default: 0.5)" }),
});

export type FlickerOptions = Required<z.output<typeof FlickerOptionsSchema>>;

export const flickerEffect: EffectDefinition<FlickerOptions> = {
    enabledByDefault: false,
    defaults: { strength: 0.5 },
};
