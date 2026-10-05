// Sound recipes: the sfxr parameter set, under friendlier names. sfxr is Tomas Pettersson's
// (DrPetter's) classic retro sound effect generator; this follows jsfxr
// (https://github.com/chr15m/jsfxr, public domain), a JavaScript port of it.

import { z } from "zod";
import type { Random } from "../random.ts";

export const WAVES = ["square", "sawtooth", "sine", "noise"] as const;
export type RecipeWave = (typeof WAVES)[number];

interface RecipeParam {
    label: string;
    group: string;
    /** -1 to 1 when signed, otherwise 0 to 1 */
    signed?: boolean;
    default: number;
}

/** Every number in a recipe, in order, with its group, label and default. */
export const RECIPE_PARAMS = {
    attack: { group: "Envelope", label: "Attack", default: 0 },
    sustain: { group: "Envelope", label: "Sustain", default: 0.3 },
    punch: { group: "Envelope", label: "Punch", default: 0 },
    decay: { group: "Envelope", label: "Decay", default: 0.4 },
    frequency: { group: "Pitch", label: "Start pitch", default: 0.3 },
    minFrequency: { group: "Pitch", label: "Cut-off pitch", default: 0 },
    slide: { group: "Pitch", label: "Slide", signed: true, default: 0 },
    deltaSlide: { group: "Pitch", label: "Slide change", signed: true, default: 0 },
    vibratoDepth: { group: "Vibrato", label: "Depth", default: 0 },
    vibratoSpeed: { group: "Vibrato", label: "Speed", default: 0 },
    arpeggio: { group: "Arpeggio", label: "Pitch jump", signed: true, default: 0 },
    arpeggioSpeed: { group: "Arpeggio", label: "When", default: 0 },
    duty: { group: "Square wave", label: "Duty", default: 0 },
    dutySweep: { group: "Square wave", label: "Duty sweep", signed: true, default: 0 },
    repeatSpeed: { group: "Repeat", label: "Repeat speed", default: 0 },
    flangerOffset: { group: "Flanger", label: "Offset", signed: true, default: 0 },
    flangerSweep: { group: "Flanger", label: "Sweep", signed: true, default: 0 },
    lowpass: { group: "Filters", label: "Low-pass cut-off", default: 1 },
    lowpassSweep: { group: "Filters", label: "Low-pass sweep", signed: true, default: 0 },
    lowpassResonance: { group: "Filters", label: "Low-pass resonance", default: 0 },
    highpass: { group: "Filters", label: "High-pass cut-off", default: 0 },
    highpassSweep: { group: "Filters", label: "High-pass sweep", signed: true, default: 0 },
    volume: { group: "Volume", label: "Volume", default: 0.5 },
} as const satisfies Record<string, RecipeParam>;

export type RecipeParamName = keyof typeof RECIPE_PARAMS;

const paramSchema = (param: RecipeParam) =>
    z
        .number()
        .min(param.signed ? -1 : 0)
        .max(1)
        .optional()
        .meta({ description: `${param.group}: ${param.label} (default: ${param.default})` });

export const RecipeSchema = z
    .strictObject({
        wave: z.enum(WAVES).optional().meta({ description: 'The waveform (default: "square")' }),
        ...(Object.fromEntries(
            Object.entries(RECIPE_PARAMS).map(([name, param]) => [name, paramSchema(param)]),
        ) as { [K in RecipeParamName]: z.ZodOptional<z.ZodNumber> }),
    })
    .meta({
        description:
            "A generated sound effect, made from sfxr-style settings. Design one on the sound " +
            "in the editor (?edit, Sounds).",
    });

/** A recipe with every setting filled in. */
export type Recipe = { wave: RecipeWave } & { [K in RecipeParamName]: number };

export function defaultRecipe(): Recipe {
    const recipe = { wave: "square" } as Recipe;
    for (const [name, param] of Object.entries(RECIPE_PARAMS)) {
        recipe[name as RecipeParamName] = param.default;
    }
    return recipe;
}

/** Fills in a recipe as written. */
export function fillRecipe(written: z.output<typeof RecipeSchema>): Recipe {
    const recipe = defaultRecipe();
    if (written.wave) recipe.wave = written.wave;
    for (const name of Object.keys(RECIPE_PARAMS) as RecipeParamName[]) {
        const value = written[name];
        if (value !== undefined) recipe[name] = value;
    }
    return recipe;
}

/** A recipe as JSON: only what differs from the defaults, rounded to 4 places. */
export function compactRecipe(recipe: Recipe): Partial<Recipe> {
    const out: Partial<Recipe> = {};
    if (recipe.wave !== "square") out.wave = recipe.wave;
    for (const [name, param] of Object.entries(RECIPE_PARAMS)) {
        const value = Math.round(recipe[name as RecipeParamName] * 10000) / 10000;
        if (value !== param.default) out[name as RecipeParamName] = value;
    }
    return out;
}

/** Keeps every setting in its range (the presets, like sfxr's, can overshoot). */
export function clampRecipe(recipe: Recipe): Recipe {
    const out = { ...recipe };
    for (const [name, param] of Object.entries(RECIPE_PARAMS) as [RecipeParamName, RecipeParam][]) {
        out[name] = Math.min(Math.max(out[name], param.signed ? -1 : 0), 1);
    }
    return out;
}

// ─── Presets ─────────────────────────────────────────────────────────────────
// Each rolls a random sound of a familiar kind, as sfxr's buttons do.

export const PRESETS = [
    "pickup",
    "laser",
    "explosion",
    "powerUp",
    "hit",
    "jump",
    "blip",
    "synth",
    "tone",
    "click",
    "random",
] as const;

export type Preset = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<Preset, string> = {
    pickup: "Pickup",
    laser: "Laser",
    explosion: "Explosion",
    powerUp: "Power-up",
    hit: "Hit",
    jump: "Jump",
    blip: "Blip",
    synth: "Synth",
    tone: "Tone",
    click: "Click",
    random: "Random",
};

export function presetRecipe(preset: Preset, random: Random = Math.random): Recipe {
    const frnd = (range: number) => random() * range;
    const rnd = (max: number) => Math.floor(random() * (max + 1));
    const rndr = (from: number, to: number) => random() * (to - from) + from;
    const waveOf = (n: number): RecipeWave => WAVES[n] ?? "square";
    const r = defaultRecipe();

    const presets: Record<Preset, () => void> = {
        pickup() {
            r.wave = "sawtooth";
            r.frequency = 0.4 + frnd(0.5);
            r.sustain = frnd(0.1);
            r.decay = 0.1 + frnd(0.4);
            r.punch = 0.3 + frnd(0.3);
            if (rnd(1)) {
                r.arpeggioSpeed = 0.5 + frnd(0.2);
                r.arpeggio = 0.2 + frnd(0.4);
            }
        },
        laser() {
            r.wave = waveOf(rnd(2));
            if (r.wave === "sine" && rnd(1)) r.wave = waveOf(rnd(1));
            if (rnd(2) === 0) {
                r.frequency = 0.3 + frnd(0.6);
                r.minFrequency = frnd(0.1);
                r.slide = -0.35 - frnd(0.3);
            } else {
                r.frequency = 0.5 + frnd(0.5);
                r.minFrequency = Math.max(0.2, r.frequency - 0.2 - frnd(0.6));
                r.slide = -0.15 - frnd(0.2);
            }
            if (rnd(1)) {
                r.duty = frnd(0.5);
                r.dutySweep = frnd(0.2);
            } else {
                r.duty = 0.4 + frnd(0.5);
                r.dutySweep = -frnd(0.7);
            }
            r.sustain = 0.1 + frnd(0.2);
            r.decay = frnd(0.4);
            if (rnd(1)) r.punch = frnd(0.3);
            if (rnd(2) === 0) {
                r.flangerOffset = frnd(0.2);
                r.flangerSweep = -frnd(0.2);
            }
            r.highpass = frnd(0.3);
        },
        explosion() {
            r.wave = "noise";
            if (rnd(1)) {
                r.frequency = (0.1 + frnd(0.4)) ** 2;
                r.slide = -0.1 + frnd(0.4);
            } else {
                r.frequency = (0.2 + frnd(0.7)) ** 2;
                r.slide = -0.2 - frnd(0.2);
            }
            if (rnd(4) === 0) r.slide = 0;
            if (rnd(2) === 0) r.repeatSpeed = 0.3 + frnd(0.5);
            r.sustain = 0.1 + frnd(0.3);
            r.decay = frnd(0.5);
            if (rnd(1)) {
                r.flangerOffset = -0.3 + frnd(0.9);
                r.flangerSweep = -frnd(0.3);
            }
            r.punch = 0.2 + frnd(0.6);
            if (rnd(1)) {
                r.vibratoDepth = frnd(0.7);
                r.vibratoSpeed = frnd(0.6);
            }
            if (rnd(2) === 0) {
                r.arpeggioSpeed = 0.6 + frnd(0.3);
                r.arpeggio = 0.8 - frnd(1.6);
            }
        },
        powerUp() {
            if (rnd(1)) {
                r.wave = "sawtooth";
                r.duty = 1;
            } else {
                r.duty = frnd(0.6);
            }
            r.frequency = 0.2 + frnd(0.3);
            if (rnd(1)) {
                r.slide = 0.1 + frnd(0.4);
                r.repeatSpeed = 0.4 + frnd(0.4);
            } else {
                r.slide = 0.05 + frnd(0.2);
                if (rnd(1)) {
                    r.vibratoDepth = frnd(0.7);
                    r.vibratoSpeed = frnd(0.6);
                }
            }
            r.sustain = frnd(0.4);
            r.decay = 0.1 + frnd(0.4);
        },
        hit() {
            r.wave = waveOf(rnd(2));
            if (r.wave === "sine") r.wave = "noise";
            if (r.wave === "square") r.duty = frnd(0.6);
            if (r.wave === "sawtooth") r.duty = 1;
            r.frequency = 0.2 + frnd(0.6);
            r.slide = -0.3 - frnd(0.4);
            r.sustain = frnd(0.1);
            r.decay = 0.1 + frnd(0.2);
            if (rnd(1)) r.highpass = frnd(0.3);
        },
        jump() {
            r.wave = "square";
            r.duty = frnd(0.6);
            r.frequency = 0.3 + frnd(0.3);
            r.slide = 0.1 + frnd(0.2);
            r.sustain = 0.1 + frnd(0.3);
            r.decay = 0.1 + frnd(0.2);
            if (rnd(1)) r.highpass = frnd(0.3);
            if (rnd(1)) r.lowpass = 1 - frnd(0.6);
        },
        blip() {
            r.wave = waveOf(rnd(1));
            r.duty = r.wave === "square" ? frnd(0.6) : 1;
            r.frequency = 0.2 + frnd(0.4);
            r.sustain = 0.1 + frnd(0.1);
            r.decay = frnd(0.2);
            r.highpass = 0.1;
        },
        synth() {
            r.wave = waveOf(rnd(1));
            r.frequency = [0.2723, 0.1926, 0.1362][rnd(2)] ?? 0.2723;
            r.attack = rnd(4) > 3 ? frnd(0.5) : 0;
            r.sustain = frnd(1);
            r.punch = frnd(1);
            r.decay = frnd(0.9) + 0.1;
            r.arpeggio = [0, 0, 0, 0, -0.3162, 0.7454, 0.7454][rnd(6)] ?? 0;
            r.arpeggioSpeed = frnd(0.5) + 0.4;
            r.duty = frnd(1);
            r.dutySweep = rnd(2) === 2 ? frnd(1) : 0;
            r.lowpass = [1, 0.9 * frnd(1) * frnd(1) + 0.1][rnd(1)] ?? 1;
            r.lowpassSweep = rndr(-1, 1);
            r.lowpassResonance = frnd(1);
            r.highpass = rnd(3) === 3 ? frnd(1) : 0;
            r.highpassSweep = rnd(3) === 3 ? frnd(1) : 0;
        },
        tone() {
            r.wave = "sine";
            r.frequency = 0.35173364; // 440 Hz
            r.sustain = 0.6641; // 1 second
            r.decay = 0;
        },
        click() {
            presets[rnd(1) ? "hit" : "explosion"]();
            if (rnd(1)) r.slide = -0.5 + frnd(1);
            if (rnd(1)) {
                r.sustain *= frnd(0.4) + 0.2;
                r.decay *= frnd(0.4) + 0.2;
            }
            if (rnd(3) === 0) r.attack = frnd(0.3);
            r.frequency = 1 - frnd(0.25);
            r.highpass = 1 - frnd(0.1);
        },
        random() {
            r.wave = waveOf(rnd(3));
            r.frequency = rnd(1) ? (frnd(2) - 1) ** 3 + 0.5 : frnd(1) ** 2;
            r.slide = (frnd(2) - 1) ** 5;
            if (r.frequency > 0.7 && r.slide > 0.2) r.slide = -r.slide;
            if (r.frequency < 0.2 && r.slide < -0.05) r.slide = -r.slide;
            r.deltaSlide = (frnd(2) - 1) ** 3;
            r.duty = frnd(1);
            r.dutySweep = (frnd(2) - 1) ** 3;
            r.vibratoDepth = Math.abs((frnd(2) - 1) ** 3);
            r.vibratoSpeed = frnd(1);
            r.attack = Math.abs(rndr(-1, 1) ** 3);
            r.sustain = rndr(-1, 1) ** 2;
            r.decay = frnd(1);
            r.punch = frnd(0.8) ** 2;
            if (r.attack + r.sustain + r.decay < 0.2) {
                r.sustain += 0.2 + frnd(0.3);
                r.decay += 0.2 + frnd(0.3);
            }
            r.lowpassResonance = frnd(1);
            r.lowpass = 1 - frnd(1) ** 3;
            r.lowpassSweep = (frnd(2) - 1) ** 3;
            if (r.lowpass < 0.1 && r.lowpassSweep < -0.05) r.lowpassSweep = -r.lowpassSweep;
            r.highpass = frnd(1) ** 5;
            r.highpassSweep = (frnd(2) - 1) ** 5;
            r.flangerOffset = (frnd(2) - 1) ** 3;
            r.flangerSweep = (frnd(2) - 1) ** 3;
            r.repeatSpeed = frnd(1);
            r.arpeggioSpeed = frnd(1);
            r.arpeggio = frnd(2) - 1;
        },
    };

    presets[preset]();
    return clampRecipe(r);
}

/** Nudges some of a recipe's settings a little, for variations on a sound. */
export function mutateRecipe(recipe: Recipe, random: Random = Math.random): Recipe {
    const out = { ...recipe };
    for (const name of Object.keys(RECIPE_PARAMS) as RecipeParamName[]) {
        if (name === "volume") continue;
        if (random() < 0.5) out[name] += random() * 0.1 - 0.05;
    }
    return clampRecipe(out);
}
