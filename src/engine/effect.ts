import { z } from "zod";

/**
 * The framework-free half of an effect: its options and their defaults. The other half is
 * its view in `src/effects/<name>/`.
 *
 * To add an effect: create `src/effects/<name>/definition.ts` exporting an options schema
 * and a definition, register it in `src/engine/schema/effects.ts`, then add a view to the
 * UI registry in `src/ui/effects.ts` (typed so a missing view fails to compile).
 */
export interface EffectDefinition<O> {
    /** Whether the effect is on when a program doesn't mention it. */
    enabledByDefault: boolean;
    defaults: O;
}

/** How a program sets an effect: on/off, or on with options. */
export function effectSetting<S extends z.ZodType>(options: S, description: string) {
    return z.union([z.boolean(), options]).optional().meta({ description });
}
