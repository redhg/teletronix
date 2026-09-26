import { z } from "zod";
import type { EffectDefinition } from "../../engine/effect.ts";

export const StaticOptionsSchema = z
    .strictObject({
        opacity: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .meta({ description: "Strength of the noise, from 0 to 1 (default: 0.15)" }),
        fps: z
            .number()
            .min(1)
            .max(60)
            .optional()
            .meta({ description: "Noise frames per second (default: 24)" }),
        scale: z
            .int()
            .min(1)
            .max(16)
            .optional()
            .meta({ description: "Size of a noise pixel, in screen pixels (default: 3)" }),
    })
    .meta({ description: "Analog TV noise over the screen. Off by default." });

export type StaticOptions = Required<z.output<typeof StaticOptionsSchema>>;

export const staticEffect: EffectDefinition<StaticOptions> = {
    enabledByDefault: false,
    defaults: { opacity: 0.15, fps: 24, scale: 3 },
};
