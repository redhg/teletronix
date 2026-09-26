// Every number the synthesizer uses for Teletronix's own sounds, with the defaults. A
// program can override any of them in config.sound.voices; the sound test page (?sound,
// Built-in tab) tunes them by ear and prints the JSON for that.

import { z } from "zod";

export interface NumberParam {
    label: string;
    min: number;
    max: number;
    step: number;
}

export interface ChoiceParam {
    label: string;
    options: readonly string[];
}

export type Param = NumberParam | ChoiceParam;

const WAVES = ["square", "sine", "triangle", "sawtooth"] as const;
export type Wave = (typeof WAVES)[number];

const hz = (label: string, min: number, max: number): NumberParam => ({ label, min, max, step: 1 });
const seconds = (label: string, max: number): NumberParam => ({
    label,
    min: 0.001,
    max,
    step: 0.001,
});
const level = (label = "Level"): NumberParam => ({ label, min: 0, max: 1, step: 0.005 });
const wave = (label = "Wave"): ChoiceParam => ({ label, options: WAVES });

export const VOICE_PARAMS = {
    key: {
        label: "Key click",
        description: "Each character typed, and keys pressed in a prompt",
        params: {
            pitch: hz("Pitch (Hz)", 100, 8000),
            spread: hz("Random pitch spread (Hz)", 0, 4000),
            q: { label: "Resonance", min: 0.1, max: 20, step: 0.1 },
            length: seconds("Length (s)", 0.2),
            level: level(),
            gap: seconds("Least time between clicks (s)", 0.2),
        },
    },
    glitch: {
        label: "Glitch",
        description: "Glitch reveals and the glitch transition",
        params: {
            level: level("Noise level"),
            tone: level("Tone level"),
            density: { label: "Stutter density", min: 0, max: 1, step: 0.01 },
            stutter: seconds("Shortest stutter (s)", 0.2),
            stutterSpread: seconds("Stutter spread (s)", 0.2),
            pitch: hz("Lowest tone (Hz)", 20, 4000),
            pitchSpread: hz("Tone spread (Hz)", 0, 8000),
            band: hz("Lowest noise band (Hz)", 100, 8000),
            bandSpread: hz("Noise band spread (Hz)", 0, 12000),
        },
    },
    burst: {
        label: "Static burst",
        description: "The static transition",
        params: {
            highpass: hz("Cut below (Hz)", 20, 8000),
            q: { label: "Resonance", min: 0.1, max: 20, step: 0.1 },
            level: level(),
        },
    },
    hiss: {
        label: "Static hiss",
        description: "Under the static effect, as loud as the static is strong",
        params: {
            highpass: hz("Cut below (Hz)", 20, 8000),
            level: level("Level at full static"),
        },
    },
    select: {
        label: "Select",
        description: "Links, toggles, dialog buttons, known commands",
        params: {
            from: hz("First pitch (Hz)", 50, 4000),
            to: hz("Second pitch (Hz)", 50, 4000),
            length: seconds("Each note (s)", 0.3),
            level: level(),
            wave: wave(),
        },
    },
    tick: {
        label: "Slider tick",
        description: "A slider moving a step",
        params: {
            pitch: hz("Pitch (Hz)", 50, 8000),
            length: seconds("Length (s)", 0.2),
            level: level(),
            gap: seconds("Least time between ticks (s)", 0.2),
            wave: wave(),
        },
    },
    dialog: {
        label: "Dialog",
        description: "A dialog opening",
        params: {
            pitch: hz("Pitch (Hz)", 50, 4000),
            length: seconds("Length (s)", 1),
            level: level(),
            wave: wave(),
        },
    },
    alert: {
        label: "Alert",
        description: 'A dialog with the "alert" class opening',
        params: {
            from: hz("First pitch (Hz)", 50, 4000),
            to: hz("Second pitch (Hz)", 50, 4000),
            length: seconds("Each note (s)", 1),
            level: level(),
            wave: wave(),
        },
    },
    error: {
        label: "Error",
        description: "A command the prompt doesn't know",
        params: {
            pitch: hz("Pitch (Hz)", 20, 2000),
            length: seconds("Length (s)", 1),
            level: level(),
            wave: wave(),
        },
    },
    hum: {
        label: "CRT hum",
        description: "Mains hum and flyback whine, all the time (when turned on)",
        params: {
            mains: hz("Mains (Hz)", 40, 70),
            mainsLevel: level("Mains level"),
            harmonicLevel: level("Harmonic level"),
            whine: hz("Whine (Hz)", 1000, 20000),
            whineLevel: level("Whine level"),
        },
    },
} as const satisfies Record<
    string,
    { label: string; description: string; params: Record<string, Param> }
>;

export type VoiceName = keyof typeof VOICE_PARAMS;

type ValueOf<P> = P extends ChoiceParam ? Wave : number;
export type Voices = {
    [V in VoiceName]: {
        [K in keyof (typeof VOICE_PARAMS)[V]["params"]]: ValueOf<
            (typeof VOICE_PARAMS)[V]["params"][K]
        >;
    };
};

export const DEFAULT_VOICES: Voices = {
    key: { pitch: 1800, spread: 1400, q: 1.2, length: 0.018, level: 0.5, gap: 0.03 },
    glitch: {
        level: 0.3,
        tone: 0.012,
        density: 0.55,
        stutter: 0.012,
        stutterSpread: 0.03,
        pitch: 120,
        pitchSpread: 1800,
        band: 800,
        bandSpread: 4000,
    },
    burst: { highpass: 1000, q: 0.7, level: 0.5 },
    hiss: { highpass: 2000, level: 0.25 },
    select: { from: 880, to: 1320, length: 0.035, level: 0.06, wave: "square" },
    tick: { pitch: 1600, length: 0.015, level: 0.04, gap: 0.04, wave: "square" },
    dialog: { pitch: 660, length: 0.1, level: 0.2, wave: "sine" },
    alert: { from: 440, to: 330, length: 0.15, level: 0.08, wave: "square" },
    error: { pitch: 110, length: 0.18, level: 0.08, wave: "square" },
    hum: { mains: 60, mainsLevel: 0.05, harmonicLevel: 0.025, whine: 15734, whineLevel: 0.006 },
};

/** A deep copy of the default voices, to edit. */
export const copyVoices = (): Voices => JSON.parse(JSON.stringify(DEFAULT_VOICES));

// ─── Schema ──────────────────────────────────────────────────────────────────

const paramSchema = (param: Param, fallback: unknown) => {
    const description = `${param.label} (default: ${JSON.stringify(fallback)})`;
    return "options" in param
        ? z
              .enum(param.options as readonly [string, ...string[]])
              .optional()
              .meta({ description })
        : z.number().min(param.min).max(param.max).optional().meta({ description });
};

/** One voice's overrides: any of its settings. */
export const voiceSchema = (name: VoiceName) => {
    const spec = VOICE_PARAMS[name];
    return z
        .strictObject(
            Object.fromEntries(
                Object.entries(spec.params).map(([key, param]) => [
                    key,
                    paramSchema(param, (DEFAULT_VOICES[name] as Record<string, unknown>)[key]),
                ]),
            ),
        )
        .meta({ description: `${spec.label}: ${spec.description}` });
};

export const VoicesSchema = z
    .strictObject(
        Object.fromEntries(
            (Object.keys(VOICE_PARAMS) as VoiceName[]).map((name) => [
                name,
                voiceSchema(name).optional(),
            ]),
        ),
    )
    .meta({
        description:
            "Adjustments to Teletronix's own sounds, overriding their defaults. Tune them by ear " +
            "on the sound test page (?sound, Built-in tab) and paste the result here.",
    });

/** Voice overrides as a program writes them: any voice, any of its settings. */
export type VoiceOverrides = { [V in VoiceName]?: Partial<Voices[V]> };

/** The defaults with a program's overrides laid over them. */
export function mergeVoices(overrides: VoiceOverrides | undefined): Voices {
    const voices = copyVoices();
    for (const [name, values] of Object.entries(overrides ?? {})) {
        Object.assign(voices[name as VoiceName], values);
    }
    return voices;
}

/** Only the settings that differ from the defaults, or nothing if none do. */
export function voiceOverrides(voices: Voices): VoiceOverrides | undefined {
    const out: Record<string, Record<string, unknown>> = {};
    for (const name of Object.keys(DEFAULT_VOICES) as VoiceName[]) {
        const defaults = DEFAULT_VOICES[name] as Record<string, unknown>;
        const changed = Object.entries(voices[name]).filter(
            ([key, value]) => defaults[key] !== value,
        );
        if (changed.length > 0) out[name] = Object.fromEntries(changed);
    }
    return Object.keys(out).length > 0 ? (out as VoiceOverrides) : undefined;
}
