import { z } from "zod";
import type { EffectsSetting } from "./effects.ts";

// ─── Fonts ───────────────────────────────────────────────────────────────────
// Pixel fonts are only crisp at whole multiples of their pixel height, so each font
// records it. The PC fonts are from The Ultimate Oldschool PC Font Pack by VileR (int10h.org,
// CC BY-SA 4.0); Departure Mono is by Helena Zhang (SIL OFL 1.1); Home Video, Digit Tech,
// MatrixType (CC0) and X Typewriter (SIL OFL 1.1) are by GGBotNet. Those four lack the box
// lines, blocks and arrows Teletronix draws with, so each has a symbol font made to its
// measure (scripts/symbols-font.ts). System fonts aren't bundled: they're used if the
// player's computer has them, and the browser's own monospace font if not. They can be any
// size.

interface FontInfo {
    name: string;
    pixelHeight: number;
    /** For a font installed on the player's computer: its CSS family name. */
    system?: string;
    /** Smooth curves and segments rather than pixels: smoothed, at any size. */
    outline?: boolean;
    /** The symbol font that fills in what it lacks (src/assets/fonts/symbols-<id>.otf) */
    symbols?: string;
}

export const FONTS = {
    "ast-premiumexec": { name: "AST Premium Exec", pixelHeight: 19 },
    "ibm-vga": { name: "IBM VGA", pixelHeight: 16 },
    "ibm-ega": { name: "IBM EGA", pixelHeight: 14 },
    "ibm-cga": { name: "IBM CGA", pixelHeight: 16 },
    "ibm-cga-thin": { name: "IBM CGA (thin)", pixelHeight: 16 },
    "ibm-mda": { name: "IBM MDA", pixelHeight: 14 },
    "toshiba-satellite": { name: "Toshiba Satellite", pixelHeight: 16 },
    "departure-mono": { name: "Departure Mono", pixelHeight: 11 },
    "home-video": { name: "Home Video (VCR)", pixelHeight: 20, symbols: "home-video" },
    "digit-tech": {
        name: "Digit Tech (LCD segments)",
        pixelHeight: 1,
        outline: true,
        symbols: "digit-tech",
    },
    matrixtype: {
        name: "MatrixType (dot matrix)",
        pixelHeight: 1,
        outline: true,
        symbols: "matrixtype",
    },
    "x-typewriter": {
        name: "X Typewriter",
        pixelHeight: 1,
        outline: true,
        symbols: "x-typewriter",
    },
    "courier-new": { name: "Courier New (installed)", pixelHeight: 1, system: '"Courier New"' },
    consolas: { name: "Consolas (installed, Windows)", pixelHeight: 1, system: "Consolas" },
    menlo: { name: "Menlo (installed, macOS)", pixelHeight: 1, system: "Menlo" },
    // whichever clear monospace font the device has: for legibility, e.g. high contrast
    "system-mono": {
        name: "The device's own monospace",
        pixelHeight: 1,
        system: 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono"',
    },
} as const satisfies Record<string, FontInfo>;

/** Whether a font is one installed on the player's computer, rather than bundled. */
export const isSystemFont = (font: FontId): boolean => "system" in FONTS[font];

/** Whether a font is drawn smoothed: an installed font, or an outline one. */
export const isSmoothFont = (font: FontId): boolean =>
    isSystemFont(font) || "outline" in FONTS[font];

export type FontId = keyof typeof FONTS;
export const DEFAULT_FONT: FontId = "departure-mono";

export const FontSchema = z.enum(Object.keys(FONTS) as [FontId, ...FontId[]]).meta({
    description:
        "The typeface: a period PC font; a VCR's (\"home-video\"), an LCD's segments " +
        '("digit-tech"), a dot-matrix printer\'s ("matrixtype") or a typewriter\'s ' +
        '("x-typewriter"); or one installed on the player\'s computer ("courier-new", ' +
        '"consolas" on Windows, "menlo" on macOS; the browser\'s own monospace font where it ' +
        "isn't) (default: the theme's, or \"departure-mono\")",
});

/** How much bigger (or smaller) than usual text is. */
export const DEFAULT_FONT_SCALE = 0.75;

export const FontScaleSchema = z
    .number()
    .min(0.5)
    .max(2)
    .meta({
        description:
            "How big text is, from 0.5 (half the usual size) to 2 (twice). A pixel font still " +
            "snaps to whole multiples of its pixels, so it grows in steps (default: 0.75)",
    });

/** How far apart lines are, as a multiple of the text's size. */
export const DEFAULT_LINE_SPACING = 1.25;

export const LineSpacingSchema = z
    .number()
    .min(1)
    .max(2)
    .meta({
        description:
            "How far apart lines are, as a multiple of the text's size, from 1 (touching, so " +
            "block art and box drawing join up, as on the original machines) to 2 (default: 1.25)",
    });

// ─── Characters ──────────────────────────────────────────────────────────────

/** One character (a code point): a letter, a symbol, a box line. */
const CharacterSchema = z
    .string()
    .refine((text) => Array.from(text).length === 1, { message: "One character" });

export const CharactersSchema = z.record(CharacterSchema, CharacterSchema).meta({
    description:
        'Characters shown as others, e.g. { "<": "(", "█": "#" }: for a font without some ' +
        "character, or just for the look. Only what's shown changes, one character for " +
        "one, so text keeps its shape; commands, conditions and what players type are " +
        "matched as written.",
});

// ─── Themes ──────────────────────────────────────────────────────────────────

// A theme is colors, and the shadow text casts; and can bring a look of its own, a font and
// effects, which a program's own font and effects override.

/** What text casts: a CRT's glow, a dark drop shadow, an LCD's segments' shadow, ink's bleed. */
export const TEXT_SHADOWS = ["glow", "drop", "lcd", "ink", "none"] as const;
export type TextShadow = (typeof TEXT_SHADOWS)[number];

export interface Palette {
    /** Text */
    fg: string;
    /** Background */
    bg: string;
    /** Warnings: text with the "alert" class */
    alert: string;
    /** The shadow text casts */
    shadow: TextShadow;
    /** Show every letter as a capital, however it's written */
    capitals?: boolean;
    /** Bands of this color behind every other three lines, like fanfold printer paper */
    stripes?: string;
    /** Sprocket holes down both sides, like fanfold printer paper */
    sprockets?: boolean;
}

interface Theme extends Palette {
    /** Its font, unless the program has one */
    font?: FontId;
    /** Its effects, under the program's */
    effects?: EffectsSetting;
}

/** Every effect off (the rest are off unless turned on). */
const NO_EFFECTS: EffectsSetting = { scanlines: false };

export const THEMES = {
    default: { fg: "#d4f9fa", bg: "#000c0c", alert: "#ff3c00", shadow: "glow" },
    amber: { fg: "#e07d0b", bg: "#080400", alert: "#ff3c00", shadow: "glow" },
    green: { fg: "#24a114", bg: "#000200", alert: "#ff3c00", shadow: "glow" },
    white: { fg: "#dadada", bg: "#020202", alert: "#ff3c00", shadow: "glow" },
    // a VCR's on-screen menu: white on blue, a little tape noise
    vcr: {
        fg: "#f4f4f4",
        bg: "#1531c9",
        alert: "#ffd23a",
        shadow: "drop",
        font: "home-video",
        effects: { static: { opacity: 0.06 }, scanlines: { opacity: 0.2 } },
    },
    // a calculator's or a car stereo's: dark segments on grey-green glass
    lcd: {
        fg: "#1f261a",
        bg: "#a9b58e",
        alert: "#6e1414",
        shadow: "lcd",
        capitals: true,
        font: "digit-tech",
        effects: { scanlines: false },
    },
    // typed on paper
    paper: {
        fg: "#2b2622",
        bg: "#f1e9d2",
        alert: "#a8201a",
        shadow: "ink",
        font: "x-typewriter",
        effects: { scanlines: false, vignette: { strength: 0.3 } },
    },
    // high contrast, for legibility: plain colors, a clear font, no effects or glow
    "contrast-dark": {
        fg: "#ffffff",
        bg: "#000000",
        alert: "#ffd400",
        shadow: "none",
        font: "system-mono",
        effects: NO_EFFECTS,
    },
    "contrast-light": {
        fg: "#000000",
        bg: "#ffffff",
        alert: "#b00000",
        shadow: "none",
        font: "system-mono",
        effects: NO_EFFECTS,
    },
    // printed by a dot-matrix printer
    printout: {
        fg: "#2a3242",
        bg: "#fbfbf3",
        alert: "#b3261e",
        shadow: "ink",
        stripes: "#dcead6",
        sprockets: true,
        font: "matrixtype",
        effects: { scanlines: false },
    },
} as const satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;
export const DEFAULT_THEME: ThemeName = "default";

const ColorSchema = z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #33ff66")
    .meta({ description: "A hex color, e.g. #33ff66" });

export const CustomThemeSchema = z
    .strictObject({
        fg: ColorSchema.meta({ description: "Text color" }),
        bg: ColorSchema.meta({ description: "Background color" }),
        alert: ColorSchema.optional().meta({
            description: 'Color of text with the "alert" class (default: "#ff3c00")',
        }),
        shadow: z
            .enum(TEXT_SHADOWS)
            .optional()
            .meta({
                description:
                    'The shadow text casts: a CRT\'s "glow", a dark "drop" shadow, an LCD\'s ' +
                    'segments\' faint "lcd" shadow, ink\'s slight "ink" bleed, or "none" ' +
                    '(default: "glow")',
            }),
        stripes: ColorSchema.optional().meta({
            description:
                "Bands of this color behind every other three lines, scrolling with the text, " +
                "like green-bar printer paper (default: none)",
        }),
        sprockets: z
            .boolean()
            .optional()
            .meta({
                description:
                    "Sprocket holes down both sides, scrolling with the text, like fanfold printer " +
                    "paper; left out on narrow screens (default: false)",
            }),
        capitals: z
            .boolean()
            .optional()
            .meta({
                description:
                    "Show every letter as a capital, as an LCD would, however it's written " +
                    "(default: false)",
            }),
    })
    .meta({ description: "Your own colors" });

export const ThemeSchema = z
    .union([z.enum(Object.keys(THEMES) as [ThemeName, ...ThemeName[]]), CustomThemeSchema])
    .meta({
        description:
            'The color scheme: "default" (pale blue on black), "amber", "green" or "white"; ' +
            'a look of its own, with a font and effects: "vcr" (a VCR\'s blue menu), "lcd" ' +
            '(an LCD\'s segments), "paper" (typed) or "printout" (dot matrix, on green-bar ' +
            'paper); "contrast-dark" or "contrast-light", for legibility; or your own ' +
            'colors (default: "default")',
    });

export type ThemeSetting = z.output<typeof ThemeSchema>;

/** The colors for a theme setting. */
export function resolveTheme(theme: ThemeSetting | undefined): Palette {
    const named: Palette = THEMES[typeof theme === "string" ? theme : DEFAULT_THEME];
    const { fg, bg, alert, shadow, capitals, stripes, sprockets } = named;
    if (theme === undefined || typeof theme === "string") {
        return {
            fg,
            bg,
            alert,
            shadow,
            ...(capitals ? { capitals } : {}),
            ...(stripes ? { stripes } : {}),
            ...(sprockets ? { sprockets } : {}),
        };
    }
    return { alert, shadow, ...theme };
}

/** A theme's font, if it has one of its own. */
export function themeFont(theme: ThemeSetting | undefined): FontId | undefined {
    return typeof theme === "string" ? (THEMES[theme] as Theme).font : undefined;
}

/** A theme's effects, if it has any of its own: under the program's. */
export function themeEffects(theme: ThemeSetting | undefined): EffectsSetting | undefined {
    return typeof theme === "string" ? (THEMES[theme] as Theme).effects : undefined;
}
