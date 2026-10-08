import { Group, Radio, SimpleGrid, Text } from "@mantine/core";
import { useEffect } from "react";
import {
    type FontId,
    isSmoothFont,
    type Palette,
    resolveTheme,
    THEMES,
    type ThemeName,
    themeFont,
} from "../../engine/index.ts";
import { fontStack, loadFont } from "../../ui/appearance.ts";

const CUSTOM = "custom";

/**
 * The themes, each as a little screen in its own colors and font, to choose from (a radio
 * group: the arrow keys move between them).
 */
export function ThemePicker({
    value,
    labels,
    font,
    custom,
    onChange,
}: {
    /** The theme chosen, or "custom" */
    value: string;
    labels: Record<ThemeName, string>;
    /** The program's font, for themes without one of their own */
    font: FontId;
    /** The colors a custom theme starts from (or has) */
    custom: Palette;
    onChange: (theme: string) => void;
}) {
    const names = Object.keys(THEMES) as ThemeName[];
    const fontOf = (name: ThemeName) => themeFont(name) ?? font;
    // (each card in its theme's own font)
    useEffect(() => {
        for (const id of new Set([...names.map(fontOf), font])) void loadFont(id).catch(() => {});
    });

    return (
        <Radio.Group label="Theme" value={value} onChange={onChange}>
            <SimpleGrid cols={2} spacing="xs" mt={6}>
                {names.map((name) => (
                    <ThemeCard
                        key={name}
                        value={name}
                        label={labels[name]}
                        palette={resolveTheme(name)}
                        font={fontOf(name)}
                    />
                ))}
                <ThemeCard value={CUSTOM} label="Your own…" palette={custom} font={font} />
            </SimpleGrid>
        </Radio.Group>
    );
}

function ThemeCard({
    value,
    label,
    palette,
    font,
}: {
    value: string;
    label: string;
    palette: Palette;
    font: FontId;
}) {
    return (
        <Radio.Card value={value} radius="md" p={6} className="editor-theme" aria-label={label}>
            <div
                className="editor-theme-screen"
                style={{
                    background: palette.stripes
                        ? `repeating-linear-gradient(to bottom, ${palette.bg} 0 50%, ${palette.stripes} 50% 100%) 0 0 / 100% 2.5em, ${palette.bg}`
                        : palette.bg,
                    color: palette.fg,
                    fontFamily: fontStack(font),
                    textTransform: palette.capitals ? "uppercase" : undefined,
                    WebkitFontSmoothing: isSmoothFont(font) ? "auto" : "none",
                }}
                aria-hidden="true"
            >
                <div>&gt; READY</div>
                <div style={{ color: palette.alert }}>ALERT ▓▒░</div>
            </div>
            <Group gap={6} mt={6} wrap="nowrap" align="start">
                <Radio.Indicator size="xs" mt={2} />
                <Text size="xs" lh={1.3}>
                    {label}
                </Text>
            </Group>
        </Radio.Card>
    );
}
