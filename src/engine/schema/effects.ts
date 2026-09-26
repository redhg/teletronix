import { z } from "zod";
import {
    type ScanlinesOptions,
    ScanlinesOptionsSchema,
    scanlinesEffect,
} from "../../effects/scanlines/definition.ts";
import {
    type StaticOptions,
    StaticOptionsSchema,
    staticEffect,
} from "../../effects/static/definition.ts";
import { type EffectDefinition, effectSetting } from "../effect.ts";

// The registry of effects. Adding an effect means adding it here.
export const EffectsSchema = z
    .strictObject({
        scanlines: effectSetting(ScanlinesOptionsSchema, "CRT scanlines (on by default)"),
        static: effectSetting(StaticOptionsSchema, "Analog TV noise (off by default)"),
    })
    .meta({ description: "Visual effects: true, false, or an object of options" });

export interface EffectOptions {
    scanlines: ScanlinesOptions;
    static: StaticOptions;
}

export type EffectName = keyof EffectOptions;

const effects: { [N in EffectName]: EffectDefinition<EffectOptions[N]> } = {
    scanlines: scanlinesEffect,
    static: staticEffect,
};

/** Effects as a program or screen sets them. */
export type EffectsSetting = z.output<typeof EffectsSchema>;

/** The effects that are on, with every option filled in. Effects that are off are absent. */
export type ResolvedEffects = { [N in EffectName]?: EffectOptions[N] };

/**
 * Works out which effects are on for a screen: the defaults, then the program's settings,
 * then the screen's. `true` turns an effect on, `false` off, and an object turns it on
 * with those options layered over the ones before.
 */
export function resolveEffects(
    ...layers: readonly (EffectsSetting | undefined)[]
): ResolvedEffects {
    const resolved: ResolvedEffects = {};

    for (const name of Object.keys(effects) as EffectName[]) {
        const definition = effects[name];
        let enabled = definition.enabledByDefault;
        let options: object = definition.defaults;

        for (const layer of layers) {
            const setting = layer?.[name];
            if (setting === undefined) continue;
            enabled = setting !== false;
            if (typeof setting === "object") options = { ...options, ...definedOnly(setting) };
        }

        if (enabled) Object.assign(resolved, { [name]: options });
    }

    return resolved;
}

function definedOnly(value: object): object {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}
