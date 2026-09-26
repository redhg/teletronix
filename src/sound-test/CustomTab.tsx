import { useEffect, useRef, useState } from "react";
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
} from "../engine/sound/recipe.ts";
import type { Synth } from "../ui/sound/synth.ts";

const STORAGE_KEY = "teletronix:sound-designer";
/** How long a slider must rest before the sound plays, so a drag doesn't stutter. */
const AUTOPLAY_DELAY = 200;

const load = (): Recipe => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        const parsed = saved ? RecipeSchema.safeParse(JSON.parse(saved)) : null;
        if (parsed?.success) return fillRecipe(parsed.data);
    } catch {
        // nothing saved, or storage unavailable
    }
    return presetRecipe("blip");
};

const save = (recipe: Recipe) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(compactRecipe(recipe)));
    } catch {
        // not saved, but still applied
    }
};

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

/** A designer for brand new sounds: sfxr-style settings, and the JSON for them. */
export function CustomTab({ synth }: { synth: Synth }) {
    const [recipe, setRecipe] = useState<Recipe>(load);
    const [autoplay, setAutoplay] = useState(true);
    const [copied, setCopied] = useState(false);
    const [pasted, setPasted] = useState("");
    const [pasteError, setPasteError] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => save(recipe), [recipe]);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    const play = (sound: Recipe = recipe) => {
        synth.unlock();
        synth.playRecipe(sound);
    };

    /** Sets a new recipe; `now` plays it at once (buttons), otherwise after a pause (sliders). */
    const change = (next: Recipe, now = false) => {
        setRecipe(next);
        if (!autoplay && !now) return;
        if (timer.current) clearTimeout(timer.current);
        if (now) play(next);
        else timer.current = setTimeout(() => play(next), AUTOPLAY_DELAY);
    };

    const json = JSON.stringify(compactRecipe(recipe), null, 4);

    const copy = async () => {
        await navigator.clipboard.writeText(json);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const loadPasted = () => {
        try {
            const parsed = RecipeSchema.safeParse(JSON.parse(pasted));
            if (!parsed.success) {
                setPasteError(parsed.error.issues[0]?.message ?? "Not a sound recipe");
                return;
            }
            setPasteError(null);
            change(fillRecipe(parsed.data), true);
        } catch {
            setPasteError("That isn't valid JSON");
        }
    };

    return (
        <div className="designer">
            <p className="hint">
                Design a new sound effect: start from a preset, adjust it by ear, and copy the JSON.
                Presets roll a new random sound each time, as in sfxr, the classic retro sound
                generator this is based on.
            </p>

            <div className="buttons presets">
                {PRESETS.map((preset) => (
                    <button
                        key={preset}
                        type="button"
                        onClick={() => change(presetRecipe(preset), true)}
                    >
                        {PRESET_LABELS[preset]}
                    </button>
                ))}
            </div>
            <div className="buttons">
                <button type="button" className="primary" onClick={() => play()}>
                    Play
                </button>
                <button type="button" onClick={() => change(mutateRecipe(recipe), true)}>
                    Mutate
                </button>
                <button type="button" onClick={() => change(defaultRecipe(), true)}>
                    Reset
                </button>
                <label>
                    <input
                        type="checkbox"
                        checked={autoplay}
                        onChange={(e) => setAutoplay(e.target.checked)}
                    />{" "}
                    Play on every change
                </label>
            </div>

            <div className="designer-grid">
                <fieldset className="effect on">
                    <legend>Wave</legend>
                    <div className="waves">
                        {WAVES.map((wave) => (
                            <label key={wave}>
                                <input
                                    type="radio"
                                    name="wave"
                                    checked={recipe.wave === wave}
                                    onChange={() => change({ ...recipe, wave }, true)}
                                />{" "}
                                {capitalize(wave)}
                            </label>
                        ))}
                    </div>
                </fieldset>
                {GROUPS.map(([group, names]) => (
                    <fieldset key={group} className="effect on">
                        <legend>{group}</legend>
                        {names.map((name) => {
                            const param = RECIPE_PARAMS[name];
                            const signed = "signed" in param && param.signed;
                            return (
                                <label
                                    key={name}
                                    className={
                                        recipe[name] === param.default ? "row" : "row edited"
                                    }
                                >
                                    <span>{param.label}</span>
                                    <input
                                        type="range"
                                        min={signed ? -1 : 0}
                                        max={1}
                                        step={0.001}
                                        value={recipe[name]}
                                        onChange={(e) =>
                                            change({ ...recipe, [name]: Number(e.target.value) })
                                        }
                                    />
                                    <output>{recipe[name].toFixed(3)}</output>
                                </label>
                            );
                        })}
                    </fieldset>
                ))}
            </div>

            <section className="sound-code">
                <h2>The sound, as JSON</h2>
                <pre className="output">{json}</pre>
                <div className="buttons">
                    <button type="button" onClick={copy}>
                        {copied ? "Copied" : "Copy"}
                    </button>
                </div>
                <h2>Load a sound</h2>
                <textarea
                    className="paste"
                    rows={4}
                    placeholder='Paste a sound&#39;s JSON, e.g. { "wave": "noise", "decay": 0.3 }'
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                />
                <div className="buttons">
                    <button type="button" onClick={loadPasted} disabled={!pasted.trim()}>
                        Load
                    </button>
                    {pasteError && <span className="paste-error">{pasteError}</span>}
                </div>
            </section>
        </div>
    );
}
