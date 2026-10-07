import { ColorInput, Group, Select, SimpleGrid, Slider, Stack, Switch, Text } from "@mantine/core";
import { useMemo } from "react";
import {
    compactEffects,
    compactSound,
    DEFAULT_FONT,
    DEFAULT_FONT_SCALE,
    DEFAULT_LINE_SPACING,
    DEFAULT_THEME,
    EFFECT_OPTIONS_SCHEMAS,
    EFFECTS,
    type EffectName,
    type EffectsSetting,
    type EffectsState,
    expandEffects,
    FONTS,
    type FontId,
    type Palette,
    type ResolvedSound,
    resolveSound,
    resolveTheme,
    SOUND_KINDS,
    type SoundKind,
    type SoundSetting,
    TEXT_SHADOWS,
    type TextShadow,
    THEMES,
    type ThemeName,
    type ThemeSetting,
    themeEffects,
    themeFont,
} from "../../engine/index.ts";
import { Panel } from "../../mantine/Panel.tsx";
import type { Path } from "../paths.ts";
import { describe, jsonSchemaOf } from "../SchemaForm.tsx";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The themes' names in the list. */
const THEME_LABELS: Record<ThemeName, string> = {
    default: "Default (pale blue)",
    amber: "Amber",
    green: "Green",
    white: "White",
    vcr: "VCR (a blue on-screen menu)",
    lcd: "LCD (segments)",
    paper: "Paper (typewriter)",
    printout: "Printout (dot matrix)",
};

const SHADOW_LABELS: Record<TextShadow, string> = {
    glow: "A CRT's glow",
    drop: "A dark drop shadow",
    lcd: "An LCD's faint shadow",
    ink: "Ink's slight bleed",
    none: "None",
};

/** A custom theme as written: its colors, and its shadow and capitals if not the usual. */
function customTheme(palette: Palette): ThemeSetting {
    const { shadow, capitals, stripes, ...colors } = palette;
    return {
        ...colors,
        ...(shadow === "glow" ? {} : { shadow }),
        ...(capitals ? { capitals } : {}),
        ...(stripes ? { stripes } : {}),
    };
}

/** The config's appearance properties: this section's, not the Program section's. */
export const APPEARANCE_KEYS = ["theme", "font", "fontScale", "lineSpacing", "effects", "sound"];

/** A program's appearance, from its config as written (anything missing at its default). */
export function appearanceOf(config: Record<string, unknown>) {
    const theme = config.theme as ThemeSetting | undefined;
    // (a theme can have a font of its own)
    const fallback = themeFont(theme) ?? DEFAULT_FONT;
    const font = (config.font as FontId | undefined) ?? fallback;
    return {
        theme,
        font: font in FONTS ? font : fallback,
        fontScale: typeof config.fontScale === "number" ? config.fontScale : DEFAULT_FONT_SCALE,
        lineSpacing:
            typeof config.lineSpacing === "number" ? config.lineSpacing : DEFAULT_LINE_SPACING,
        effects: config.effects as EffectsSetting | undefined,
        sound: config.sound as SoundSetting | undefined,
    };
}

interface Props {
    config: Record<string, unknown>;
    /** Sets a config property (undefined: leaves it out, for its default) */
    set: (path: Path, value: unknown) => void;
}

/** Colours, font, effects and sound, written into the config only where they differ from the defaults. */
export function AppearanceSection({ config, set }: Props) {
    const appearance = appearanceOf(config);
    const palette = resolveTheme(appearance.theme);
    const themeChoice =
        typeof appearance.theme === "object" ? "custom" : (appearance.theme ?? DEFAULT_THEME);
    // (a theme can have effects of its own, which the program's are laid over)
    const baseEffects = themeEffects(appearance.theme);
    const effects = expandEffects(appearance.effects, baseEffects);
    const baseFont = themeFont(appearance.theme) ?? DEFAULT_FONT;
    const sound = resolveSound(appearance.sound);

    const setTheme = (theme: ThemeSetting | undefined) =>
        set(["theme"], theme === DEFAULT_THEME ? undefined : theme);
    const setEffects = (state: EffectsState) =>
        set(["effects"], compactEffects(state, baseEffects));
    const setSound = (next: ResolvedSound | null) => set(["sound"], compactSound(next));

    return (
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <Stack>
                <Panel title="Colours">
                    <Select
                        label="Theme"
                        data={[
                            ...(Object.keys(THEMES) as ThemeName[]).map((name) => ({
                                value: name,
                                label: THEME_LABELS[name],
                            })),
                            { value: "custom", label: "Custom…" },
                        ]}
                        value={themeChoice}
                        allowDeselect={false}
                        onChange={(choice) =>
                            setTheme(
                                choice === "custom" ? customTheme(palette) : (choice as ThemeName),
                            )
                        }
                    />
                    {(themeFont(appearance.theme) || baseEffects) && (
                        <Text size="xs" c="dimmed">
                            It brings a font and effects of its own: choose others below to change
                            them.
                        </Text>
                    )}
                    <SimpleGrid cols={{ base: 1, xl: 3 }}>
                        {(["fg", "bg", "alert"] as const).map((key) => (
                            <ColorInput
                                key={key}
                                label={{ fg: "Text", bg: "Background", alert: "Alerts" }[key]}
                                value={palette[key]}
                                disabled={themeChoice !== "custom"}
                                format="hex"
                                onChange={(color) =>
                                    setTheme(customTheme({ ...palette, [key]: color }))
                                }
                            />
                        ))}
                    </SimpleGrid>
                    {themeChoice === "custom" && (
                        <Group align="end">
                            <Select
                                label="Text's shadow"
                                data={TEXT_SHADOWS.map((shadow) => ({
                                    value: shadow,
                                    label: SHADOW_LABELS[shadow],
                                }))}
                                value={palette.shadow}
                                allowDeselect={false}
                                onChange={(shadow) =>
                                    setTheme(
                                        customTheme({
                                            ...palette,
                                            shadow: (shadow ?? "glow") as TextShadow,
                                        }),
                                    )
                                }
                            />
                            <Switch
                                label="Capitals"
                                mb={8}
                                checked={palette.capitals === true}
                                onChange={(event) =>
                                    setTheme(
                                        customTheme({
                                            ...palette,
                                            capitals: event.currentTarget.checked,
                                        }),
                                    )
                                }
                            />
                            <ColorInput
                                label="Stripes"
                                description="Bands behind every other three lines"
                                placeholder="None"
                                format="hex"
                                value={palette.stripes ?? ""}
                                onChange={(color) =>
                                    setTheme(
                                        customTheme({ ...palette, stripes: color || undefined }),
                                    )
                                }
                            />
                        </Group>
                    )}
                </Panel>

                <Panel title="Font">
                    <Select
                        label="Typeface"
                        data={(Object.keys(FONTS) as FontId[]).map((id) => ({
                            value: id,
                            label: FONTS[id].name,
                        }))}
                        value={appearance.font}
                        allowDeselect={false}
                        onChange={(font) =>
                            set(["font"], font === baseFont ? undefined : (font ?? undefined))
                        }
                    />
                    <Labelled label={`Text size: ${appearance.fontScale.toFixed(2)}×`}>
                        <Slider
                            aria-label="Text size"
                            min={0.5}
                            max={2}
                            step={0.05}
                            value={appearance.fontScale}
                            label={(value) => `${value.toFixed(2)}×`}
                            onChange={(value) =>
                                set(["fontScale"], value === DEFAULT_FONT_SCALE ? undefined : value)
                            }
                        />
                    </Labelled>
                    <Labelled label={`Line spacing: ${appearance.lineSpacing.toFixed(2)}×`}>
                        <Slider
                            aria-label="Line spacing"
                            min={1}
                            max={2}
                            step={0.05}
                            value={appearance.lineSpacing}
                            label={(value) => `${value.toFixed(2)}×`}
                            onChange={(value) =>
                                set(
                                    ["lineSpacing"],
                                    value === DEFAULT_LINE_SPACING ? undefined : value,
                                )
                            }
                        />
                    </Labelled>
                    <Text size="xs" c="dimmed">
                        At 1×, lines touch, so block art and box drawing join up, as on the original
                        machines.{" "}
                        {FONTS[appearance.font].pixelHeight > 1
                            ? "A pixel font stays crisp by growing in steps of its own pixels, so the size jumps rather than slides."
                            : "Installed fonts can be any size."}
                    </Text>
                </Panel>

                <Panel title="Sound">
                    <Switch
                        label="Sound"
                        checked={sound !== null}
                        onChange={(event) =>
                            setSound(event.currentTarget.checked ? resolveSound(undefined) : null)
                        }
                    />
                    {sound && (
                        <>
                            <Labelled label={`Volume: ${sound.volume}`}>
                                <Slider
                                    aria-label="Volume"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={sound.volume}
                                    onChange={(volume) => setSound({ ...sound, volume })}
                                />
                            </Labelled>
                            <SimpleGrid cols={2}>
                                {(Object.keys(SOUND_KINDS) as SoundKind[]).map((kind) => (
                                    <Switch
                                        key={kind}
                                        label={capitalize(kind)}
                                        description={SOUND_KINDS[kind].description}
                                        checked={sound[kind]}
                                        onChange={(event) =>
                                            setSound({
                                                ...sound,
                                                [kind]: event.currentTarget.checked,
                                            })
                                        }
                                    />
                                ))}
                            </SimpleGrid>
                        </>
                    )}
                    <Text size="xs" c="dimmed">
                        Click or press a key in the preview to hear it: browsers only play sound
                        once you've interacted with the page.
                    </Text>
                </Panel>
            </Stack>

            <Panel title="Effects">
                <Effects effects={effects} onChange={setEffects} />
            </Panel>
        </SimpleGrid>
    );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <Stack gap={4}>
            <Text size="sm" fw={500}>
                {label}
            </Text>
            {children}
        </Stack>
    );
}

/** A switch per effect, with controls for its options built from its schema. */
function Effects({
    effects,
    onChange,
}: {
    effects: EffectsState;
    onChange: (effects: EffectsState) => void;
}) {
    const schemas = useMemo(
        () =>
            Object.fromEntries(
                (Object.keys(EFFECTS) as EffectName[]).map((name) => [
                    name,
                    jsonSchemaOf(EFFECT_OPTIONS_SCHEMAS[name]),
                ]),
            ),
        [],
    );
    const update = (name: EffectName, change: { on?: boolean; option?: [string, unknown] }) => {
        const current = effects[name];
        const options = change.option
            ? { ...current.options, [change.option[0]]: change.option[1] }
            : current.options;
        onChange({ ...effects, [name]: { on: change.on ?? current.on, options } });
    };

    return (
        <Stack gap="lg">
            {(Object.keys(EFFECTS) as EffectName[]).map((name) => {
                const { on, options } = effects[name];
                const schema = schemas[name];
                return (
                    <Stack key={name} gap="xs">
                        <Switch
                            label={capitalize(name)}
                            description={describe(schema ?? {}).text}
                            checked={on}
                            onChange={(event) => update(name, { on: event.currentTarget.checked })}
                        />
                        {on && (
                            <Stack gap="xs" pl={46}>
                                {Object.entries(schema?.properties ?? {}).map(([key, option]) => {
                                    const value = options[key as keyof typeof options] as unknown;
                                    if (option.type === "boolean") {
                                        return (
                                            <Switch
                                                key={key}
                                                size="xs"
                                                label={capitalize(key)}
                                                description={describe(option).text}
                                                checked={value === true}
                                                onChange={(event) =>
                                                    update(name, {
                                                        option: [key, event.currentTarget.checked],
                                                    })
                                                }
                                            />
                                        );
                                    }
                                    const min = option.minimum ?? 0;
                                    const max = option.maximum ?? 1;
                                    const step =
                                        option.type === "integer" ? 1 : max - min <= 1 ? 0.01 : 0.5;
                                    return (
                                        <Group key={key} gap="sm" wrap="nowrap">
                                            <Text size="xs" w={90} title={describe(option).text}>
                                                {capitalize(key)}
                                            </Text>
                                            <Slider
                                                aria-label={`${name} ${key}`}
                                                style={{ flex: 1 }}
                                                size="sm"
                                                min={min}
                                                max={max}
                                                step={step}
                                                value={Number(value)}
                                                onChange={(next) =>
                                                    update(name, { option: [key, next] })
                                                }
                                            />
                                            <Text size="xs" w={40} ta="right" ff="monospace">
                                                {Number(value)}
                                            </Text>
                                        </Group>
                                    );
                                })}
                            </Stack>
                        )}
                    </Stack>
                );
            })}
        </Stack>
    );
}
