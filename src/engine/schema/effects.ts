import { z } from "zod";
import {
    type BloomOptions,
    BloomOptionsSchema,
    bloomEffect,
} from "../../effects/bloom/definition.ts";
import {
    type FlickerOptions,
    FlickerOptionsSchema,
    flickerEffect,
} from "../../effects/flicker/definition.ts";
import {
    type FringeOptions,
    FringeOptionsSchema,
    fringeEffect,
} from "../../effects/fringe/definition.ts";
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
import {
    type VignetteOptions,
    VignetteOptionsSchema,
    vignetteEffect,
} from "../../effects/vignette/definition.ts";
import { type EffectDefinition, effectSetting } from "../effect.ts";

// The registry of effects. Adding an effect means adding it here.
export const EffectsSchema = z
    .strictObject({
        scanlines: effectSetting(ScanlinesOptionsSchema, "CRT scanlines (on by default)"),
        static: effectSetting(StaticOptionsSchema, "Analog TV noise (off by default)"),
        bloom: effectSetting(BloomOptionsSchema, "Glow around bright things (off by default)"),
        vignette: effectSetting(VignetteOptionsSchema, "Darkened corners (off by default)"),
        flicker: effectSetting(
            FlickerOptionsSchema,
            "An unsteady, dimming picture (off by default)",
        ),
        fringe: effectSetting(
            FringeOptionsSchema,
            "Red and cyan color fringes on text (off by default)",
        ),
    })
    .meta({ description: "Visual effects: true, false, or an object of options" });

export interface EffectOptions {
    scanlines: ScanlinesOptions;
    static: StaticOptions;
    bloom: BloomOptions;
    vignette: VignetteOptions;
    flicker: FlickerOptions;
    fringe: FringeOptions;
}

export type EffectName = keyof EffectOptions;

export const EFFECTS: { [N in EffectName]: EffectDefinition<EffectOptions[N]> } = {
    scanlines: scanlinesEffect,
    static: staticEffect,
    bloom: bloomEffect,
    vignette: vignetteEffect,
    flicker: flickerEffect,
    fringe: fringeEffect,
};

/** Each effect's options schema, for tools that build controls from it. */
export const EFFECT_OPTIONS_SCHEMAS: { [N in EffectName]: z.ZodType } = {
    scanlines: ScanlinesOptionsSchema,
    static: StaticOptionsSchema,
    bloom: BloomOptionsSchema,
    vignette: VignetteOptionsSchema,
    flicker: FlickerOptionsSchema,
    fringe: FringeOptionsSchema,
};

/** Every effect, on or off, with all its options: what a settings panel edits. */
export type EffectsState = { [N in EffectName]: { on: boolean; options: EffectOptions[N] } };

/** Expands a program's effects setting into the full state, over a theme's (`base`). */
export function expandEffects(
    setting: EffectsSetting | undefined,
    base?: EffectsSetting,
): EffectsState {
    const resolved = resolveEffects(base, setting);
    const state = {} as Record<EffectName, { on: boolean; options: object }>;
    for (const name of Object.keys(EFFECTS) as EffectName[]) {
        const options = resolved[name];
        state[name] = { on: options !== undefined, options: options ?? EFFECTS[name].defaults };
    }
    return state as EffectsState;
}

/**
 * The smallest setting for a state: only what differs from the defaults, or from a theme's
 * effects (`base`), which it's laid over.
 */
export function compactEffects(
    state: EffectsState,
    base?: EffectsSetting,
): EffectsSetting | undefined {
    const setting: Record<string, boolean | object> = {};
    const before = expandEffects(undefined, base);
    for (const name of Object.keys(EFFECTS) as EffectName[]) {
        const enabledByDefault = before[name].on;
        const defaults = before[name].options as Record<string, unknown>;
        const { on, options } = state[name];
        const changed = Object.entries(options).filter(
            ([key, value]) => defaults[key as keyof typeof defaults] !== value,
        );
        if (!on) {
            if (enabledByDefault) setting[name] = false;
        } else if (changed.length > 0) {
            setting[name] = Object.fromEntries(changed);
        } else if (!enabledByDefault) {
            setting[name] = true;
        }
    }
    return Object.keys(setting).length > 0 ? (setting as EffectsSetting) : undefined;
}

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

    for (const name of Object.keys(EFFECTS) as EffectName[]) {
        const definition = EFFECTS[name];
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
