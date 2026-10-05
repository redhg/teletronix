import {
    Button,
    Group,
    Select,
    SimpleGrid,
    Slider,
    Stack,
    Switch,
    Text,
    TextInput,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { compactSound, resolveSound, type SoundSetting } from "../../engine/index.ts";
import {
    DEFAULT_VOICES,
    type Param,
    VOICE_PARAMS,
    type VoiceName,
    type Voices,
} from "../../engine/sound/voices.ts";
import { Panel } from "../../mantine/Panel.tsx";
import { Synth } from "../../ui/sound/synth.ts";

const isChoice = (param: Param) => "options" in param;

interface Props {
    /** The config's sound setting, as written */
    setting: SoundSetting | undefined;
    /** Sets it: only what differs from the defaults is written */
    onChange: (setting: SoundSetting | undefined) => void;
}

/**
 * Tuning Teletronix's own sounds (the key click, the beeps, the glitch…) by ear, written into
 * the config's `sound.voices`.
 */
export function VoicesPanel({ setting, onChange }: Props) {
    // (a new setting only when it's edited: each version of the program stays as it was)
    const sound = useMemo(() => resolveSound(setting), [setting]);
    const [synth] = useState(() => new Synth());
    const [hum, setHum] = useState(false);
    const [hiss, setHiss] = useState(0);
    // every kind of sound on, so each can be heard, with the voices as edited
    useEffect(() => {
        if (!sound) return;
        synth.configure(
            { ...sound, typing: true, glitch: true, static: true, interface: true, hum },
            false,
        );
    }, [synth, sound, hum]);
    useEffect(() => synth.setHiss(hiss), [synth, hiss]);

    if (!sound) {
        return (
            <Text c="dimmed">
                This program's sound is off (see Appearance): there's nothing to tune.
            </Text>
        );
    }
    const setVoices = (voices: Voices) => onChange(compactSound({ ...sound, voices }));
    const set = (voice: VoiceName, key: string, value: number | string) =>
        setVoices({ ...sound.voices, [voice]: { ...sound.voices[voice], [key]: value } });

    return (
        <Stack gap="md">
            <Text size="sm" c="dimmed">
                Play each of Teletronix's own sounds and adjust it by ear. Only what you change is
                written, into the program's <code>config.sound.voices</code>.
            </Text>
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
                {(Object.keys(VOICE_PARAMS) as VoiceName[]).map((name) => {
                    const spec = VOICE_PARAMS[name];
                    const values = sound.voices[name] as Record<string, number | string>;
                    const defaults = DEFAULT_VOICES[name] as Record<string, number | string>;
                    return (
                        <Panel key={name} title={spec.label}>
                            <Text size="xs" c="dimmed">
                                {spec.description}
                            </Text>
                            <Group gap="xs">
                                {name === "hum" ? (
                                    <Switch
                                        label="Play the hum"
                                        checked={hum}
                                        onChange={(event) => {
                                            synth.unlock();
                                            setHum(event.currentTarget.checked);
                                        }}
                                    />
                                ) : name === "hiss" ? (
                                    <Group gap="sm" wrap="nowrap" style={{ flex: 1 }}>
                                        <Text size="sm">Static strength</Text>
                                        <Slider
                                            aria-label="Static strength"
                                            style={{ flex: 1 }}
                                            min={0}
                                            max={1}
                                            step={0.05}
                                            value={hiss}
                                            onChange={(value) => {
                                                synth.unlock();
                                                setHiss(value);
                                            }}
                                        />
                                    </Group>
                                ) : name === "key" ? (
                                    <TextInput
                                        size="xs"
                                        aria-label="Type here to hear key clicks"
                                        placeholder="Type here to hear key clicks"
                                        onKeyDown={() => {
                                            synth.unlock();
                                            synth.play({ type: "keypress" });
                                        }}
                                    />
                                ) : (
                                    <Button
                                        size="xs"
                                        aria-label={`Play: ${spec.label}`}
                                        onClick={() => {
                                            synth.unlock();
                                            synth.preview(name, 1);
                                        }}
                                    >
                                        Play
                                    </Button>
                                )}
                                <Button
                                    size="xs"
                                    variant="default"
                                    aria-label={`Reset: ${spec.label}`}
                                    onClick={() =>
                                        setVoices({
                                            ...sound.voices,
                                            [name]: structuredClone(DEFAULT_VOICES[name]),
                                        })
                                    }
                                >
                                    Reset
                                </Button>
                            </Group>
                            {Object.entries(spec.params).map(([key, param]) => {
                                const value = values[key];
                                const edited = value !== defaults[key];
                                return (
                                    <Group key={key} gap="sm" wrap="nowrap">
                                        <Text size="sm" w={120} fw={edited ? 600 : undefined}>
                                            {param.label}
                                        </Text>
                                        {isChoice(param) ? (
                                            <Select
                                                size="xs"
                                                aria-label={`${spec.label}: ${param.label}`}
                                                data={[...param.options]}
                                                value={String(value)}
                                                allowDeselect={false}
                                                onChange={(next) => next && set(name, key, next)}
                                            />
                                        ) : (
                                            <Slider
                                                aria-label={`${spec.label}: ${param.label}`}
                                                style={{ flex: 1 }}
                                                min={param.min}
                                                max={param.max}
                                                step={param.step}
                                                value={Number(value)}
                                                label={(shown) => String(shown)}
                                                onChange={(next) => set(name, key, next)}
                                            />
                                        )}
                                    </Group>
                                );
                            })}
                        </Panel>
                    );
                })}
            </SimpleGrid>
        </Stack>
    );
}
