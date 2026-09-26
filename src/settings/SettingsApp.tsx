import { useEffect, useMemo, useRef, useState } from "react";
import {
    compactEffects,
    compactSound,
    DEFAULT_FONT,
    DEFAULT_THEME,
    type EffectsState,
    expandEffects,
    FONTS,
    type FontId,
    type Palette,
    type Program,
    type ResolvedSound,
    resolveSound,
    resolveTheme,
    SOUND_KINDS,
    type SoundKind,
    THEMES,
    type ThemeName,
    type ThemeSetting,
} from "../engine/index.ts";
import {
    type AppearanceSettings,
    isPreviewMessage,
    type PreviewMessage,
} from "../ui/preview-protocol.ts";
import { EffectControls } from "./EffectControls.tsx";
import type { ProgramFile } from "./start.tsx";

interface Props {
    /** The program's name, as in `?data=<name>` */
    name: string;
    file: ProgramFile;
    program: Program;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Appearance settings for a program, with a live preview and the JSON to use them. */
export function SettingsApp({ name, file, program }: Props) {
    const initial = useMemo(
        () => ({
            theme: program.theme,
            font: program.font,
            effects: expandEffects(program.effects),
            sound: program.sound,
        }),
        [program],
    );
    const [theme, setTheme] = useState<ThemeSetting | undefined>(initial.theme);
    const [font, setFont] = useState<FontId>(initial.font);
    const [effects, setEffects] = useState<EffectsState>(initial.effects);
    const [sound, setSound] = useState<ResolvedSound | null>(initial.sound);
    const [copied, setCopied] = useState(false);
    const preview = useRef<HTMLIFrameElement>(null);

    const settings: AppearanceSettings = useMemo(
        () => ({ theme, font, effects: compactEffects(effects), sound: compactSound(sound) }),
        [theme, font, effects, sound],
    );

    // the config properties to write: only what differs from the defaults
    const config = useMemo(() => {
        const out: Record<string, unknown> = {};
        if (theme !== undefined && theme !== DEFAULT_THEME) out.theme = theme;
        if (font !== DEFAULT_FONT) out.font = font;
        if (settings.effects) out.effects = settings.effects;
        if (settings.sound !== undefined) out.sound = settings.sound;
        return out;
    }, [theme, font, settings.effects, settings.sound]);
    const json = JSON.stringify(config, null, 4);

    // keep the preview in step, including when it (re)loads and says it's ready
    useEffect(() => {
        const send = () => {
            const message: PreviewMessage = { type: "teletronix:appearance", settings };
            preview.current?.contentWindow?.postMessage(message, location.origin);
        };
        send();
        const handleMessage = (event: MessageEvent) => {
            const fromPreview = event.source === preview.current?.contentWindow;
            if (fromPreview && isPreviewMessage(event) && event.data.type === "teletronix:ready") {
                send();
            }
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [settings]);

    const palette = resolveTheme(theme);
    const themeChoice = typeof theme === "object" ? "custom" : (theme ?? DEFAULT_THEME);
    const chooseTheme = (choice: string) =>
        setTheme(choice === "custom" ? { ...palette } : (choice as ThemeName));
    const setColor = (key: keyof Palette, value: string) => setTheme({ ...palette, [key]: value });

    const copy = async () => {
        await navigator.clipboard.writeText(json);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const download = () => {
        const merged: ProgramFile = { ...file, config: { ...file.config } };
        for (const key of ["theme", "font", "effects", "sound"]) {
            if (key in config) merged.config[key] = config[key];
            else delete merged.config[key];
        }
        const blob = new Blob([`${JSON.stringify(merged, null, 4)}\n`], {
            type: "application/json",
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${name}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const reset = () => {
        setTheme(initial.theme);
        setFont(initial.font);
        setEffects(initial.effects);
        setSound(initial.sound);
    };

    return (
        <div className="settings">
            <aside className="settings-panel">
                <header>
                    <h1>Appearance</h1>
                    <p>
                        {program.config.name} · <a href={`?data=${name}`}>Open program</a>
                    </p>
                </header>

                <section>
                    <h2>Colors</h2>
                    <label className="row">
                        <span>Theme</span>
                        <select value={themeChoice} onChange={(e) => chooseTheme(e.target.value)}>
                            {Object.keys(THEMES).map((themeName) => (
                                <option key={themeName} value={themeName}>
                                    {capitalize(themeName)}
                                </option>
                            ))}
                            <option value="custom">Custom…</option>
                        </select>
                    </label>
                    {(["fg", "bg", "alert"] as const).map((key) => (
                        <label key={key} className="row">
                            <span>{{ fg: "Text", bg: "Background", alert: "Alerts" }[key]}</span>
                            <input
                                type="color"
                                value={palette[key]}
                                disabled={themeChoice !== "custom"}
                                onChange={(e) => setColor(key, e.target.value)}
                            />
                        </label>
                    ))}
                </section>

                <section>
                    <h2>Font</h2>
                    <label className="row">
                        <span>Typeface</span>
                        <select value={font} onChange={(e) => setFont(e.target.value as FontId)}>
                            {(Object.keys(FONTS) as FontId[]).map((id) => (
                                <option key={id} value={id}>
                                    {FONTS[id].name}
                                </option>
                            ))}
                        </select>
                    </label>
                </section>

                <section>
                    <h2>Effects</h2>
                    <EffectControls effects={effects} onChange={setEffects} />
                </section>

                <section>
                    <h2>Sound</h2>
                    <label className="row">
                        <span>Sound</span>
                        <input
                            type="checkbox"
                            checked={sound !== null}
                            onChange={(e) =>
                                setSound(e.target.checked ? resolveSound(undefined) : null)
                            }
                        />
                    </label>
                    {sound && (
                        <>
                            <label className="row">
                                <span>Volume</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={sound.volume}
                                    onChange={(e) =>
                                        setSound({ ...sound, volume: Number(e.target.value) })
                                    }
                                />
                                <output>{sound.volume}</output>
                            </label>
                            {(Object.keys(SOUND_KINDS) as SoundKind[]).map((kind) => (
                                <label
                                    key={kind}
                                    className="row"
                                    title={SOUND_KINDS[kind].description}
                                >
                                    <span>{kind.charAt(0).toUpperCase() + kind.slice(1)}</span>
                                    <input
                                        type="checkbox"
                                        checked={sound[kind]}
                                        onChange={(e) =>
                                            setSound({ ...sound, [kind]: e.target.checked })
                                        }
                                    />
                                </label>
                            ))}
                        </>
                    )}
                    <p className="hint">
                        Click or press a key in the preview to hear it: browsers only play sound
                        once you've interacted with the page.
                    </p>
                </section>

                <section>
                    <h2>Result</h2>
                    <p className="hint">
                        Add these properties to the program's <code>config</code>, or download the
                        whole program with them in place.
                    </p>
                    <pre className="output">{json === "{}" ? "{} (all defaults)" : json}</pre>
                    <div className="buttons">
                        <button type="button" onClick={copy}>
                            {copied ? "Copied" : "Copy"}
                        </button>
                        <button type="button" onClick={download}>
                            Download {name}.json
                        </button>
                        <button type="button" onClick={reset}>
                            Reset
                        </button>
                    </div>
                </section>
            </aside>

            <iframe
                ref={preview}
                className="settings-preview"
                title="Preview"
                src={`?data=${encodeURIComponent(name)}&preview`}
            />
        </div>
    );
}
