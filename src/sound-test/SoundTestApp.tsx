import { useEffect, useMemo, useState } from "react";
import { resolveSound } from "../engine/index.ts";
import { Synth } from "../ui/sound/synth.ts";
import {
    copyVoices,
    DEFAULT_VOICES,
    type Param,
    VOICE_PARAMS,
    type VoiceName,
    type Voices,
} from "../ui/sound/voices.ts";

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

/** Voices as code, ready to paste over DEFAULT_VOICES in src/ui/sound/voices.ts. */
const asCode = (voices: Voices) =>
    `export const DEFAULT_VOICES: Voices = ${JSON.stringify(voices, null, 4).replace(/"(\w+)":/g, "$1:")};\n`;

const isChoice = (param: Param) => "options" in param;

export function SoundTestApp() {
    const [voices, setVoices] = useState<Voices>(load);
    const [volume, setVolume] = useState(0.3);
    const [hum, setHum] = useState(false);
    const [hiss, setHiss] = useState(0);
    const [length, setLength] = useState(1);
    const [copied, setCopied] = useState(false);
    const [synth] = useState(() => new Synth(copyVoices()));

    useEffect(() => {
        synth.setVoices(voices);
        save(voices);
    }, [synth, voices]);

    // every kind of sound on, so each can be heard
    useEffect(() => {
        const settings = resolveSound({ volume, hum });
        synth.configure(settings, false);
    }, [synth, volume, hum]);

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
        await navigator.clipboard.writeText(asCode(voices));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="sound-test">
            <header>
                <h1>Sound test</h1>
                <p className="hint">
                    Play each sound and adjust it by ear. Changes are kept in this browser. When you
                    like them, copy the code at the bottom over <code>DEFAULT_VOICES</code> in{" "}
                    <code>src/ui/sound/voices.ts</code>.
                </p>
                <label className="row">
                    <span>Volume</span>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={volume}
                        onChange={(e) => setVolume(Number(e.target.value))}
                    />
                    <output>{volume}</output>
                </label>
                <label className="row">
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
            </header>

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
                                            [name]: structuredClone(DEFAULT_VOICES[name]),
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
                <h2>{changed ? "Your changes, as code" : "No changes yet"}</h2>
                <pre className="output">{asCode(voices)}</pre>
                <div className="buttons">
                    <button type="button" onClick={copy}>
                        {copied ? "Copied" : "Copy"}
                    </button>
                    <button type="button" onClick={() => setVoices(copyVoices())}>
                        Reset everything
                    </button>
                </div>
            </section>
        </div>
    );
}
