import { createTheme, type MantineColor, type MantineThemeOverride } from "@mantine/core";

/** Mantine's colours by the hue they start at, for matching a program's. */
const HUES: [number, MantineColor][] = [
    [0, "red"],
    [15, "orange"],
    [40, "yellow"],
    [60, "lime"],
    [90, "green"],
    [150, "teal"],
    [175, "cyan"],
    [200, "blue"],
    [230, "indigo"],
    [255, "violet"],
    [280, "grape"],
    [310, "pink"],
    [345, "red"],
];

/**
 * The Mantine colour nearest a program's text colour, for a tool's accent: an amber
 * terminal gets an orange editor and panel, a green one green. Greys (e.g. a white terminal)
 * get blue.
 */
export function accentFor(color: string): MantineColor {
    const hex = /^#?([0-9a-f]{6})$/i.exec(color.trim())?.[1];
    if (!hex) return "blue";
    const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as [
        number,
        number,
        number,
    ];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    const chroma = max - min;
    const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));
    if (saturation < 0.15) return "blue";
    let hue =
        max === r
            ? ((g - b) / chroma) % 6
            : max === g
              ? (b - r) / chroma + 2
              : (r - g) / chroma + 4;
    hue = (hue * 60 + 360) % 360;
    return HUES.reduce<MantineColor>((found, [from, name]) => (hue >= from ? name : found), "red");
}

/** The theme of Teletronix's tools (the editor, the GM's panel), in the program's colour. */
export const toolTheme = (fg: string): MantineThemeOverride =>
    createTheme({
        primaryColor: accentFor(fg),
        fontFamilyMonospace: "ui-monospace, Menlo, Consolas, monospace",
        defaultRadius: "md",
    });
