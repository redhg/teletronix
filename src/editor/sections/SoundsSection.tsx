import {
    Button,
    Code,
    Group,
    NavLink,
    SegmentedControl,
    SimpleGrid,
    Slider,
    Stack,
    Switch,
    Text,
    TextInput,
} from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { resolveSound } from "../../engine/index.ts";
import {
    compactRecipe,
    defaultRecipe,
    fillRecipe,
    mutateRecipe,
    PRESET_LABELS,
    PRESETS,
    presetRecipe,
    RECIPE_PARAMS,
    type Recipe,
    type RecipeParamName,
    RecipeSchema,
    WAVES,
} from "../../engine/sound/recipe.ts";
import { Panel } from "../../mantine/Panel.tsx";
import { Synth } from "../../ui/sound/synth.ts";

/** How long a slider must rest before the sound plays, so a drag doesn't stutter. */
const AUTOPLAY_DELAY = 200;
const NAME = /^[\w-]+$/;

// the sliders, grouped as sfxr groups them
const GROUPS = Object.entries(RECIPE_PARAMS).reduce<[string, RecipeParamName[]][]>(
    (groups, [name, param]) => {
        const last = groups.at(-1);
        if (last?.[0] === param.group) last[1].push(name as RecipeParamName);
        else groups.push([param.group, [name as RecipeParamName]]);
        return groups;
    },
    [],
);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface Props {
    sounds: Record<string, unknown>;
    /** Sets a sound (undefined: deletes it) */
    onChange: (name: string, recipe: unknown) => void;
    /** Renames a sound, and everything that plays it; returns why not, if it can't be */
    onRename: (from: string, to: string) => string | null;
}

/**
 * The program's own sound effects, designed sfxr-style: roll one from a preset, adjust it by
 * ear, and play it by name (`"sound": "its-name"`), or name it after one of Teletronix's own
 * (key, select, tick…) to replace that.
 */
export function SoundsSection({ sounds, onChange, onRename }: Props) {
    const names = Object.keys(sounds);
    const [chosen, setChosen] = useState<string | null>(names[0] ?? null);
    const current = chosen !== null && chosen in sounds ? chosen : (names[0] ?? null);
    const [adding, setAdding] = useState("");
    const addProblem =
        adding === ""
            ? null
            : !NAME.test(adding)
              ? "Letters, digits, _ and - only"
              : names.includes(adding)
                ? `"${adding}" is taken`
                : null;

    return (
        <SimpleGrid cols={{ base: 1, md: 4 }}>
            <Stack gap="sm">
                <Text size="xs" c="dimmed">
                    Play one with <Code>"sound": "its-name"</Code> on an action, an element, a
                    screen or a dialog. Name it <Code>key</Code>, <Code>select</Code>,{" "}
                    <Code>tick</Code>, <Code>error</Code>, <Code>dialog</Code> or <Code>alert</Code>{" "}
                    to replace Teletronix's own sound of that kind.
                </Text>
                <nav aria-label="Sounds">
                    {names.map((name) => (
                        <NavLink
                            key={name}
                            component="button"
                            label={name}
                            active={name === current}
                            onClick={() => setChosen(name)}
                        />
                    ))}
                    {names.length === 0 && (
                        <Text size="sm" c="dimmed">
                            None yet.
                        </Text>
                    )}
                </nav>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!adding || addProblem) return;
                        onChange(adding, compactRecipe(presetRecipe("blip")));
                        setChosen(adding);
                        setAdding("");
                    }}
                >
                    <Stack gap={6}>
                        <TextInput
                            size="xs"
                            aria-label="Add a sound"
                            placeholder="name"
                            value={adding}
                            error={addProblem}
                            onChange={(event) => setAdding(event.currentTarget.value.trim())}
                        />
                        <Button
                            type="submit"
                            size="xs"
                            variant="light"
                            disabled={!adding || Boolean(addProblem)}
                        >
                            Add a sound
                        </Button>
                    </Stack>
                </form>
            </Stack>
            <div style={{ gridColumn: "span 3" }}>
                {current !== null && (
                    <Designer
                        key={current}
                        name={current}
                        written={sounds[current]}
                        onChange={(recipe) => onChange(current, recipe)}
                        onRename={(to) => {
                            const why = onRename(current, to);
                            if (!why) setChosen(to);
                            return why;
                        }}
                        onDelete={() => onChange(current, undefined)}
                    />
                )}
            </div>
        </SimpleGrid>
    );
}

/** One sound: its name, buttons to play and roll it, and its settings. */
function Designer({
    name,
    written,
    onChange,
    onRename,
    onDelete,
}: {
    name: string;
    written: unknown;
    onChange: (recipe: unknown) => void;
    onRename: (to: string) => string | null;
    onDelete: () => void;
}) {
    const parsed = RecipeSchema.safeParse(written);
    const recipe = parsed.success ? fillRecipe(parsed.data) : defaultRecipe();
    const [synth] = useState(() => new Synth());
    useEffect(() => synth.configure(resolveSound(undefined), false), [synth]);
    const [autoplay, setAutoplay] = useState(true);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );
    const [renaming, setRenaming] = useState(name);
    const [problem, setProblem] = useState<string | null>(null);

    const play = (sound: Recipe) => {
        synth.unlock();
        synth.playRecipe(sound);
    };
    /** Sets it; `now` plays it at once (buttons), otherwise after a pause (sliders). */
    const change = (next: Recipe, now = false) => {
        onChange(compactRecipe(next));
        if (!autoplay && !now) return;
        if (timer.current) clearTimeout(timer.current);
        if (now) play(next);
        else timer.current = setTimeout(() => play(next), AUTOPLAY_DELAY);
    };

    return (
        <Stack gap="md">
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    const why = renaming === name ? null : onRename(renaming);
                    setProblem(why);
                }}
            >
                <Group align="start" gap="xs">
                    <TextInput
                        aria-label="Sound name"
                        value={renaming}
                        error={problem}
                        onChange={(event) =>
                            setRenaming(event.currentTarget.value.replace(/[^\w-]/g, "-"))
                        }
                        styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
                    />
                    <Button type="submit" variant="default" disabled={renaming === name}>
                        Rename
                    </Button>
                    <Button
                        variant="subtle"
                        color="red"
                        onClick={() => {
                            if (confirm(`Delete the sound "${name}"? (Undo brings it back.)`))
                                onDelete();
                        }}
                    >
                        Delete
                    </Button>
                </Group>
            </form>
            {!parsed.success && (
                <Text size="sm" c="red">
                    This sound has a mistake in it; the controls start from the default sound.
                </Text>
            )}
            <Group gap="xs">
                <Button onClick={() => play(recipe)}>Play</Button>
                <Button variant="default" onClick={() => change(mutateRecipe(recipe), true)}>
                    Mutate
                </Button>
                <Button variant="default" onClick={() => change(defaultRecipe(), true)}>
                    Reset
                </Button>
                <Switch
                    label="Play on every change"
                    checked={autoplay}
                    onChange={(event) => setAutoplay(event.currentTarget.checked)}
                />
            </Group>
            <Group gap={6}>
                <Text size="xs" c="dimmed">
                    Roll a new one:
                </Text>
                {PRESETS.map((preset) => (
                    <Button
                        key={preset}
                        size="compact-sm"
                        variant="light"
                        onClick={() => change(presetRecipe(preset), true)}
                    >
                        {PRESET_LABELS[preset]}
                    </Button>
                ))}
            </Group>
            <SegmentedControl
                aria-label="Wave"
                value={recipe.wave}
                data={WAVES.map((wave) => ({ value: wave, label: capitalize(wave) }))}
                onChange={(wave) => change({ ...recipe, wave: wave as Recipe["wave"] }, true)}
            />
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
                {GROUPS.map(([group, params]) => (
                    <Panel key={group} title={group}>
                        {params.map((param) => {
                            const info = RECIPE_PARAMS[param];
                            const signed = "signed" in info && info.signed;
                            return (
                                <Group key={param} gap="sm" wrap="nowrap">
                                    <Text
                                        size="sm"
                                        w={110}
                                        fw={recipe[param] === info.default ? undefined : 600}
                                    >
                                        {info.label}
                                    </Text>
                                    <Slider
                                        aria-label={info.label}
                                        style={{ flex: 1 }}
                                        min={signed ? -1 : 0}
                                        max={1}
                                        step={0.001}
                                        label={(value) => value.toFixed(3)}
                                        value={recipe[param]}
                                        onChange={(value) => change({ ...recipe, [param]: value })}
                                    />
                                </Group>
                            );
                        })}
                    </Panel>
                ))}
            </SimpleGrid>
        </Stack>
    );
}
