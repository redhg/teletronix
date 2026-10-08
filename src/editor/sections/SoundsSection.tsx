import {
    Autocomplete,
    Button,
    Code,
    Group,
    NavLink,
    SegmentedControl,
    SimpleGrid,
    Slider,
    Stack,
    Switch,
    Tabs,
    Text,
    TextInput,
} from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { resolveSound, type SoundSetting } from "../../engine/index.ts";
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
import { useDataFiles } from "../forms/files.ts";
import { VoicesPanel } from "./VoicesPanel.tsx";

/** Whether a sound as written is an audio file, rather than a generated sound. */
const isFile = (sound: unknown) => typeof sound === "object" && sound !== null && "src" in sound;

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
    /** The config's sound setting, for Teletronix's own sounds */
    setting: SoundSetting | undefined;
    onSetting: (setting: SoundSetting | undefined) => void;
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
export function SoundsSection({ setting, onSetting, sounds, onChange, onRename }: Props) {
    return (
        <Tabs defaultValue="own" keepMounted={false}>
            <Tabs.List mb="md">
                <Tabs.Tab value="own">The program's sounds</Tabs.Tab>
                <Tabs.Tab value="builtin">Teletronix's own</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="own">
                <ProgramSounds sounds={sounds} onChange={onChange} onRename={onRename} />
            </Tabs.Panel>
            <Tabs.Panel value="builtin">
                <VoicesPanel setting={setting} onChange={onSetting} />
            </Tabs.Panel>
        </Tabs>
    );
}

/** The program's own sounds: a list, and the one chosen, to design. */
function ProgramSounds({
    sounds,
    onChange,
    onRename,
}: Pick<Props, "sounds" | "onChange" | "onRename">) {
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
                    screen or a dialog. Name a generated one <Code>key</Code>, <Code>select</Code>,{" "}
                    <Code>tick</Code>, <Code>error</Code>, <Code>dialog</Code> or <Code>alert</Code>{" "}
                    to replace Teletronix's own sound of that kind. An audio file can also loop in
                    the background, as ambience.
                </Text>
                <nav aria-label="Sounds">
                    {names.map((name) => (
                        <NavLink
                            key={name}
                            component="button"
                            label={name}
                            description={isFile(sounds[name]) ? "Audio file" : undefined}
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
                        <Button
                            size="xs"
                            variant="default"
                            disabled={!adding || Boolean(addProblem)}
                            onClick={() => {
                                onChange(adding, { src: `data/audio/${adding}.mp3` });
                                setChosen(adding);
                                setAdding("");
                            }}
                        >
                            Add an audio file
                        </Button>
                    </Stack>
                </form>
            </Stack>
            <div style={{ gridColumn: "span 3" }}>
                {current !== null && isFile(sounds[current]) && (
                    <AudioFileEditor
                        key={current}
                        name={current}
                        written={sounds[current] as Record<string, unknown>}
                        onChange={(sound) => onChange(current, sound)}
                        onRename={(to) => {
                            const why = onRename(current, to);
                            if (!why) setChosen(to);
                            return why;
                        }}
                        onDelete={() => onChange(current, undefined)}
                    />
                )}
                {current !== null && !isFile(sounds[current]) && (
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

/** A sound's name, to rename, and a button to delete it. */
function SoundName({
    name,
    onRename,
    onDelete,
}: {
    name: string;
    onRename: (to: string) => string | null;
    onDelete: () => void;
}) {
    const [renaming, setRenaming] = useState(name);
    const [problem, setProblem] = useState<string | null>(null);
    return (
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
    );
}

/** An audio file: its name, where it is, how loud, and a button to hear it loop. */
function AudioFileEditor({
    name,
    written,
    onChange,
    onRename,
    onDelete,
}: {
    name: string;
    written: Record<string, unknown>;
    onChange: (sound: unknown) => void;
    onRename: (to: string) => string | null;
    onDelete: () => void;
}) {
    const src = typeof written.src === "string" ? written.src : "";
    const volume = typeof written.volume === "number" ? written.volume : 1;
    const [synth] = useState(() => new Synth());
    useEffect(() => () => synth.close(), [synth]);
    useEffect(() => synth.configure(resolveSound(undefined), false), [synth]);
    const [playing, setPlaying] = useState(false);
    const available = useDataFiles("audio");
    // (what's heard follows the settings as they change)
    useEffect(() => {
        synth.setFiles(new Map([[name, { src, volume }]]));
        synth.setAmbience(playing ? name : null);
    }, [synth, name, src, volume, playing]);

    return (
        <Stack gap="md">
            <SoundName name={name} onRename={onRename} onDelete={onDelete} />
            <Autocomplete
                label="File"
                description={
                    available.length > 0
                        ? "One of the files in public/data/audio/ (or another, from the page). MP3, OGG, WAV or M4A."
                        : "Where it is, from the page: put it in public/data/audio/ and write data/audio/its-name.mp3. MP3, OGG, WAV or M4A."
                }
                data={available}
                value={src}
                onChange={(next) => onChange({ ...written, src: next })}
                styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            />
            <Stack gap={4}>
                <Text size="sm" fw={500}>
                    Volume
                </Text>
                <Text size="xs" c="dimmed">
                    How loud it plays, under the overall volume
                </Text>
                <Slider
                    thumbLabel="Volume"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    label={(value) => value.toFixed(2)}
                    onChange={(value) => {
                        const { volume: _, ...rest } = written;
                        onChange(value === 1 ? rest : { ...rest, volume: value });
                    }}
                />
            </Stack>
            <Group gap="xs">
                <Button
                    onClick={() => {
                        synth.unlock();
                        setPlaying((was) => !was);
                    }}
                    aria-pressed={playing}
                >
                    {playing ? "Stop" : "Play"}
                </Button>
                <Text size="xs" c="dimmed">
                    It loops, as it would as ambience (config.ambience, or a screen's). As a{" "}
                    <Code>"sound"</Code>, it plays once.
                </Text>
            </Group>
        </Stack>
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
    useEffect(() => () => synth.close(), [synth]);
    useEffect(() => synth.configure(resolveSound(undefined), false), [synth]);
    const [autoplay, setAutoplay] = useState(true);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );
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
            <SoundName name={name} onRename={onRename} onDelete={onDelete} />
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
