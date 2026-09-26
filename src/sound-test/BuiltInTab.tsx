import { useEffect, useMemo, useState } from "react";
import { resolveSound } from "../engine/index.ts";
import {
    copyVoices,
    DEFAULT_VOICES,
    type Param,
    VOICE_PARAMS,
    type VoiceName,
    type Voices,
    voiceOverrides,
} from "../engine/sound/voices.ts";
import type { Synth } from "../ui/sound/synth.ts";

const STORAGE_KEY = "teletronix:sound-test";

const load = (): Voices => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return { ...copyVoices(), ...JSON.parse(saved) };
    } catch {
        // nothing saved, or storage unavailable
    }
    return copyVoices();
};

const save = (voices: Voices) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(voices));
    } catch {
        // not saved, but still applied
    }
};

/** The changed settings as a program's config.sound, ready to paste. */
const asJson = (voices: Voices) =>
    JSON.stringify({ sound: { voices: voiceOverrides(voices) ?? {} } }, null, 4);

const isChoice = (param: Param) => "options" in param;

/** Tuning Teletronix's own sounds: the key click, the glitch, the beeps… */
export function BuiltInTab({ synth, volume }: { synth: Synth; volume: number }) {
    const [voices, setVoices] = useState<Voices>(load);
    const [hum, setHum] = useState(false);
    const [hiss, setHiss] = useState(0);
    const [length, setLength] = useState(1);
    const [copied, setCopied] = useState(false);

    useEffect(() => save(voices), [voices]);

    // every kind of sound on, so each can be heard, with the voices as edited
    useEffect(() => {
        const settings = resolveSound({ volume, hum, voices: voiceOverrides(voices) });
        synth.configure(settings, false);
    }, [synth, volume, hum, voices]);

    useEffect(() => synth.setHiss(hiss), [synth, hiss]);

    const changed = useMemo(
        () => JSON.stringify(voices) !== JSON.stringify(DEFAULT_VOICES),
        [voices],
    );

    const set = (voice: VoiceName, key: string, value: number | string) =>
        setVoices({ ...voices, [voice]: { ...voices[voice], [key]: value } });

    const play = (voice: VoiceName) => {
        synth.unlock();
        if (voice !== "hum" && voice !== "hiss") synth.preview(voice, length);
    };

    const copy = async () => {
        await navigator.clipboard.writeText(asJson(voices));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <>
            <p className="hint">
                Play each of Teletronix's own sounds and adjust it by ear. Changes are kept in this
                browser. When you like them, copy the JSON at the bottom into your program's{" "}
                <code>config</code> (merge it with any <code>sound</code> settings already there).
            </p>
            <label className="row narrow">
                <span>Test length (s)</span>
                <input
                    type="range"
                    min={0.1}
                    max={3}
                    step={0.1}
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value))}
                />
                <output>{length}</output>
            </label>
            <p className="hint">Test length applies to the glitch and the static burst.</p>

            <div className="voices">
                {(Object.keys(VOICE_PARAMS) as VoiceName[]).map((name) => {
                    const spec = VOICE_PARAMS[name];
                    const values = voices[name] as Record<string, number | string>;
                    const defaults = DEFAULT_VOICES[name] as Record<string, number | string>;
                    return (
                        <fieldset key={name} className="effect on voice">
                            <legend>{spec.label}</legend>
                            <p className="hint">{spec.description}</p>
                            <div className="buttons">
                                {name === "hum" ? (
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={hum}
                                            onChange={(e) => {
                                                synth.unlock();
                                                setHum(e.target.checked);
                                            }}
                                        />{" "}
                                        Play the hum
                                    </label>
                                ) : name === "hiss" ? (
                                    <label className="row">
                                        <span>Static strength</span>
                                        <input
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.05}
                                            value={hiss}
                                            onChange={(e) => {
                                                synth.unlock();
                                                setHiss(Number(e.target.value));
                                            }}
                                        />
                                        <output>{hiss}</output>
                                    </label>
                                ) : name === "key" ? (
                                    <input
                                        className="type-here"
                                        placeholder="Type here to hear key clicks"
                                        onKeyDown={() => {
                                            synth.unlock();
                                            synth.play({ type: "keypress" });
                                        }}
                                    />
                                ) : (
                                    <button type="button" onClick={() => play(name)}>
                                        Play
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() =>
                                        setVoices({
                                            ...voices,
                                            [name]: JSON.parse(
                                                JSON.stringify(DEFAULT_VOICES[name]),
                                            ),
                                        })
                                    }
                                >
                                    Reset
                                </button>
                            </div>
                            {Object.entries(spec.params).map(([key, param]) => {
                                const value = values[key];
                                const edited = value !== defaults[key];
                                return (
                                    <label key={key} className={edited ? "row edited" : "row"}>
                                        <span>{param.label}</span>
                                        {isChoice(param) ? (
                                            <select
                                                value={String(value)}
                                                onChange={(e) => set(name, key, e.target.value)}
                                            >
                                                {param.options.map((option) => (
                                                    <option key={option}>{option}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="range"
                                                min={param.min}
                                                max={param.max}
                                                step={param.step}
                                                value={Number(value)}
                                                onChange={(e) =>
                                                    set(name, key, Number(e.target.value))
                                                }
                                            />
                                        )}
                                        <output>{isChoice(param) ? "" : value}</output>
                                    </label>
                                );
                            })}
                        </fieldset>
                    );
                })}
            </div>

            <section className="sound-code">
                <h2>{changed ? "Your changes, for your program's config" : "No changes yet"}</h2>
                <pre className="output">{asJson(voices)}</pre>
                <div className="buttons">
                    <button type="button" onClick={copy}>
                        {copied ? "Copied" : "Copy"}
                    </button>
                    <button type="button" onClick={() => setVoices(copyVoices())}>
                        Reset everything
                    </button>
                </div>
            </section>
        </>
    );
}
