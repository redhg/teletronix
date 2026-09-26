import { z } from "zod";

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
    })
    .meta({ description: "Sound options: the volume, and each kind of sound on or off" });

export const SoundSchema = z.union([z.boolean(), SoundOptionsSchema]).meta({
    description:
        "Generated retro sound effects: true, false, or an object of options. On by " +
        "default; players can mute them with the sound toggle.",
});

export type SoundSetting = z.output<typeof SoundSchema>;

/** Sound with every option filled in, or null when it's off. */
export type ResolvedSound = { volume: number } & { [K in SoundKind]: boolean };

export function resolveSound(setting: SoundSetting | undefined): ResolvedSound | null {
    if (setting === false) return null;
    const options = typeof setting === "object" ? setting : {};
    const resolved = { volume: options.volume ?? DEFAULT_VOLUME } as ResolvedSound;
    for (const kind of Object.keys(SOUND_KINDS) as SoundKind[]) {
        resolved[kind] = options[kind] ?? SOUND_KINDS[kind].default;
    }
    return resolved;
}

/** The smallest setting for a sound state: only what differs from the defaults. */
export function compactSound(sound: ResolvedSound | null): SoundSetting | undefined {
    if (sound === null) return false;
    const setting: Record<string, number | boolean> = {};
    if (sound.volume !== DEFAULT_VOLUME) setting.volume = sound.volume;
    for (const kind of Object.keys(SOUND_KINDS) as SoundKind[]) {
        if (sound[kind] !== SOUND_KINDS[kind].default) setting[kind] = sound[kind];
    }
    return Object.keys(setting).length > 0 ? (setting as SoundSetting) : undefined;
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
    | { type: "dialog"; alert: boolean };
