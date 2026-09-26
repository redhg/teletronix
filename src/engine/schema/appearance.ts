import { z } from "zod";

// ─── Fonts ───────────────────────────────────────────────────────────────────
// Pixel fonts are only crisp at whole multiples of their pixel height, so each font
// records it. All but Departure Mono are from The Ultimate Oldschool PC Font Pack by
// VileR (int10h.org, CC BY-SA 4.0); Departure Mono is by Helena Zhang (SIL OFL 1.1).

export const FONTS = {
    "ast-premiumexec": { name: "AST Premium Exec", pixelHeight: 19 },
    "ibm-vga": { name: "IBM VGA", pixelHeight: 16 },
    "ibm-ega": { name: "IBM EGA", pixelHeight: 14 },
    "ibm-cga": { name: "IBM CGA", pixelHeight: 16 },
    "ibm-cga-thin": { name: "IBM CGA (thin)", pixelHeight: 16 },
    "ibm-mda": { name: "IBM MDA", pixelHeight: 14 },
    "toshiba-satellite": { name: "Toshiba Satellite", pixelHeight: 16 },
    "departure-mono": { name: "Departure Mono", pixelHeight: 11 },
} as const;

export type FontId = keyof typeof FONTS;
export const DEFAULT_FONT: FontId = "ast-premiumexec";

export const FontSchema = z.enum(Object.keys(FONTS) as [FontId, ...FontId[]]).meta({
    description: 'The typeface, from a set of period PC fonts (default: "ast-premiumexec")',
});

// ─── Themes ──────────────────────────────────────────────────────────────────

export interface Palette {
    /** Text */
    fg: string;
    /** Background */
    bg: string;
    /** Warnings: text with the "alert" class */
    alert: string;
}

export const THEMES = {
    phosphor: { fg: "#d4f9fa", bg: "#000c0c", alert: "#ff3c00" },
    amber: { fg: "#e07d0b", bg: "#080400", alert: "#ff3c00" },
    green: { fg: "#24a114", bg: "#000200", alert: "#ff3c00" },
    white: { fg: "#dadada", bg: "#020202", alert: "#ff3c00" },
} as const satisfies Record<string, Palette>;

export type ThemeName = keyof typeof THEMES;
export const DEFAULT_THEME: ThemeName = "phosphor";

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
    })
    .meta({ description: "Your own colors" });

export const ThemeSchema = z
    .union([z.enum(Object.keys(THEMES) as [ThemeName, ...ThemeName[]]), CustomThemeSchema])
    .meta({
        description:
            'The color scheme: "phosphor" (pale blue on black), "amber", "green" or "white", ' +
            'or your own colors (default: "phosphor")',
    });

export type ThemeSetting = z.output<typeof ThemeSchema>;

/** The colors for a theme setting. */
export function resolveTheme(theme: ThemeSetting | undefined): Palette {
    if (theme === undefined) return THEMES[DEFAULT_THEME];
    if (typeof theme === "string") return THEMES[theme];
    return { alert: THEMES[DEFAULT_THEME].alert, ...theme };
}
