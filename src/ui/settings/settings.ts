// A player's own settings (quick settings, Ctrl+,): for them, on their device, over what the
// program says. Kept per program in the browser. Anything they haven't chosen follows the
// device: reduced motion shows text at once, more contrast picks high contrast (dark or light,
// as the device is). (Effects stay on with reduced motion: their moving parts already keep
// still then, e.g. the flicker goes and the static freezes.)

/** How it looks: as the program made it, or high contrast. */
export const LOOKS = ["program", "contrast-dark", "contrast-light"] as const;
export type Look = (typeof LOOKS)[number];

/** Text sizes to step through, as multiples of the program's. */
export const TEXT_SIZES = [0.75, 0.875, 1, 1.25, 1.5, 1.75, 2] as const;

/** What a player has chosen; anything left out is the device's (or program's) default. */
export interface PlayerSettings {
    look?: Look;
    textSize?: number;
    effects?: boolean;
    instant?: boolean;
    /** From 0 to 1; the program's otherwise */
    volume?: number;
    /** The program's mouse pointer, or the device's own */
    pointer?: "program" | "system";
}

/** What the device asks for: reduced motion, more contrast, a dark or light scheme. */
export interface DevicePreferences {
    reducedMotion: boolean;
    moreContrast: boolean;
    dark: boolean;
}

/** The device's preferences, now. */
export function devicePreferences(): DevicePreferences {
    const matches = (query: string) => {
        try {
            return matchMedia(query).matches;
        } catch {
            return false;
        }
    };
    return {
        reducedMotion: matches("(prefers-reduced-motion: reduce)"),
        moreContrast: matches("(prefers-contrast: more)"),
        dark: !matches("(prefers-color-scheme: light)"),
    };
}

/** Every setting decided: the player's, else the device's, else as the program has it. */
export interface Resolved {
    look: Look;
    textSize: number;
    effects: boolean;
    instant: boolean;
    volume: number | undefined;
    pointer: "program" | "system";
}

export function resolveSettings(settings: PlayerSettings, device: DevicePreferences): Resolved {
    const deviceLook: Look = device.moreContrast
        ? device.dark
            ? "contrast-dark"
            : "contrast-light"
        : "program";
    return {
        look: settings.look ?? deviceLook,
        textSize: settings.textSize ?? 1,
        effects: settings.effects ?? true,
        instant: settings.instant ?? device.reducedMotion,
        volume: settings.volume,
        pointer: settings.pointer ?? "program",
    };
}

/** The next value in a list, wrapping round, `by` steps on. */
export function step<T>(values: readonly T[], current: T, by: number): T {
    const at = Math.max(0, values.indexOf(current));
    return values[(at + by + values.length) % values.length] as T;
}

/** The next text size, stopping at the ends. */
export function stepTextSize(current: number, by: number): number {
    const at = TEXT_SIZES.findIndex((size) => size >= current - 1e-9);
    const from = at === -1 ? TEXT_SIZES.length - 1 : at;
    const to = Math.min(TEXT_SIZES.length - 1, Math.max(0, from + by));
    return TEXT_SIZES[to] as number;
}

const key = (program: string) => `teletronix:settings:${program}`;

/** A program's settings on this device (none, if storage can't be read). */
export function loadSettings(program: string): PlayerSettings {
    try {
        const stored: unknown = JSON.parse(localStorage.getItem(key(program)) ?? "{}");
        if (typeof stored !== "object" || stored === null) return {};
        const { look, textSize, effects, instant, volume, pointer } = stored as Record<
            string,
            unknown
        >;
        return {
            ...(LOOKS.includes(look as Look) ? { look: look as Look } : {}),
            ...(typeof textSize === "number" ? { textSize } : {}),
            ...(typeof effects === "boolean" ? { effects } : {}),
            ...(typeof instant === "boolean" ? { instant } : {}),
            ...(typeof volume === "number" ? { volume: Math.min(1, Math.max(0, volume)) } : {}),
            ...(pointer === "program" || pointer === "system" ? { pointer } : {}),
        };
    } catch {
        return {};
    }
}

export function saveSettings(program: string, settings: PlayerSettings): void {
    try {
        if (Object.keys(settings).length === 0) localStorage.removeItem(key(program));
        else localStorage.setItem(key(program), JSON.stringify(settings));
    } catch {
        // not remembered, but still applied
    }
}
