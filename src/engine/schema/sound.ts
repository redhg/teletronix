import { z } from "zod";
import {
    mergeVoices,
    type VoiceOverrides,
    type Voices,
    VoicesSchema,
    voiceOverrides,
} from "../sound/voices.ts";

// Teletronix makes its sounds itself (see src/ui/sound/), so a program only turns them on,
// off, or down. They're on by default, quietly.

export const SOUND_KINDS = {
    typing: { default: true, description: "Key clicks as text types in" },
    glitch: { default: true, description: "Digital crackle during glitch reveals and transitions" },
    static: { default: true, description: "Hiss under static, and the static transition" },
    interface: {
        default: true,
        description: "Beeps for links, toggles, sliders, prompts and dialogs",
    },
    hum: { default: false, description: "A CRT's mains hum and high-pitched whine, all the time" },
    ambience: {
        default: true,
        description: "Background sound from an audio file: config.ambience, and screens' own",
    },
} as const;

export type SoundKind = keyof typeof SOUND_KINDS;

export const DEFAULT_VOLUME = 0.3;

const kindSettings = Object.fromEntries(
    Object.entries(SOUND_KINDS).map(([kind, { default: on, description }]) => [
        kind,
        z
            .boolean()
            .optional()
            .meta({ description: `${description} (default: ${on})` }),
    ]),
) as { [K in SoundKind]: z.ZodOptional<z.ZodBoolean> };

export const SoundOptionsSchema = z
    .strictObject({
        volume: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .meta({ description: `Overall volume, from 0 to 1 (default: ${DEFAULT_VOLUME})` }),
        ...kindSettings,
        button: z
            .boolean()
            .optional()
            .meta({
                description:
                    "Whether the sound toggle shows in the corner of the screen (default: true). " +
                    'Without it, players mute with Ctrl+M, or a { "soundToggle": true } in a bar.',
            }),
        voices: VoicesSchema.optional(),
    })
    .meta({ description: "Sound options: the volume, and each kind of sound on or off" });

export const SoundSchema = z.union([z.boolean(), SoundOptionsSchema]).meta({
    description:
        "Generated retro sound effects: true, false, or an object of options. On by " +
        "default; players can mute them with the sound toggle.",
});

export type SoundSetting = z.output<typeof SoundSchema>;

/** Sound with every option filled in, or null when it's off. */
export type ResolvedSound = { volume: number; voices: Voices; button: boolean } & {
    [K in SoundKind]: boolean;
};

export function resolveSound(setting: SoundSetting | undefined): ResolvedSound | null {
    if (setting === false) return null;
    const options = typeof setting === "object" ? setting : {};
    const resolved = {
        volume: options.volume ?? DEFAULT_VOLUME,
        button: options.button ?? true,
        voices: mergeVoices(options.voices as VoiceOverrides | undefined),
    } as ResolvedSound;
    for (const kind of Object.keys(SOUND_KINDS) as SoundKind[]) {
        resolved[kind] = options[kind] ?? SOUND_KINDS[kind].default;
    }
    return resolved;
}

/** The smallest setting for a sound state: only what differs from the defaults. */
export function compactSound(sound: ResolvedSound | null): SoundSetting | undefined {
    if (sound === null) return false;
    const setting: Record<string, number | boolean | object> = {};
    if (sound.volume !== DEFAULT_VOLUME) setting.volume = sound.volume;
    if (!sound.button) setting.button = false;
    for (const kind of Object.keys(SOUND_KINDS) as SoundKind[]) {
        if (sound[kind] !== SOUND_KINDS[kind].default) setting[kind] = sound[kind];
    }
    const voices = voiceOverrides(sound.voices);
    if (voices) (setting as Record<string, unknown>).voices = voices;
    return Object.keys(setting).length > 0 ? (setting as SoundSetting) : undefined;
}

// ─── Audio files ─────────────────────────────────────────────────────────────

export const AudioFileSchema = z
    .strictObject({
        src: z.string().min(1).meta({
            description:
                'An audio file (MP3, OGG, WAV…), relative to the page, e.g. "data/audio/drone.mp3"',
        }),
        volume: z.number().min(0).max(1).optional().meta({
            description: "How loud it plays, from 0 to 1, under the overall volume (default: 1)",
        }),
    })
    .meta({
        description:
            "A sound from an audio file: a recording, a clip, or a background drone to play " +
            "as ambience",
    });

/** A sound from an audio file, filled in. */
export interface AudioFile {
    src: string;
    volume: number;
}

// ─── Cues ────────────────────────────────────────────────────────────────────

/** Moments the engine reports, for the player to turn into sound. */
export type Cue =
    /** A character typed in */
    | { type: "key" }
    /** A glitch reveal or glitch transition starting */
    | { type: "glitch"; duration: number }
    /** The static transition starting */
    | { type: "static"; duration: number }
    /** A dialog opening */
    | { type: "dialog"; alert: boolean }
    /** A sound from the program's sounds, by name */
    | { type: "sound"; name: string }
    /** Something chosen without a click, e.g. a button's hotkey */
    | { type: "select" }
    /** An audio file that isn't among the program's sounds (e.g. a GM's), by its address */
    | { type: "file"; src: string }
    /** Stops the sounds playing (not the ambience) */
    | { type: "stop" };
