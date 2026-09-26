import { z } from "zod";
import type { EffectDefinition } from "../../engine/effect.ts";

export const ScanlinesOptionsSchema = z
    .strictObject({
        opacity: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .meta({ description: "Strength of the lines, from 0 to 1 (default: 0.5)" }),
        moving: z
            .boolean()
            .optional()
            .meta({ description: "Roll a bright line down the screen (default: true)" }),
    })
    .meta({ description: "CRT scanlines, with an optional rolling band. On by default." });

export type ScanlinesOptions = Required<z.output<typeof ScanlinesOptionsSchema>>;

export const scanlinesEffect: EffectDefinition<ScanlinesOptions> = {
    enabledByDefault: true,
    defaults: { opacity: 0.5, moving: true },
};
