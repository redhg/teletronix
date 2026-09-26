import { useMemo } from "react";
import { z } from "zod";
import {
    EFFECT_OPTIONS_SCHEMAS,
    EFFECTS,
    type EffectName,
    type EffectsState,
} from "../engine/index.ts";

interface Props {
    effects: EffectsState;
    onChange: (effects: EffectsState) => void;
}

interface OptionSchema {
    type?: string;
    minimum?: number;
    maximum?: number;
    description?: string;
}

interface EffectSchema {
    description?: string;
    properties?: Record<string, OptionSchema>;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const withoutDefault = (text = "") => text.replace(/\s*\(default: .+\)$/, "");

/** A switch per effect, with controls for its options built from its schema. */
export function EffectControls({ effects, onChange }: Props) {
    const schemas = useMemo(
        () =>
            Object.fromEntries(
                (Object.keys(EFFECTS) as EffectName[]).map((name) => [
                    name,
                    z.toJSONSchema(EFFECT_OPTIONS_SCHEMAS[name]) as EffectSchema,
                ]),
            ) as Record<EffectName, EffectSchema>,
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
        <div className="effects">
            {(Object.keys(EFFECTS) as EffectName[]).map((name) => {
                const { on, options } = effects[name];
                const schema = schemas[name];
                return (
                    <fieldset key={name} className={on ? "effect on" : "effect"}>
                        <legend>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={(e) => update(name, { on: e.target.checked })}
                                />
                                {capitalize(name)}
                            </label>
                        </legend>
                        <p className="hint">{withoutDefault(schema.description)}</p>
                        {Object.entries(schema.properties ?? {}).map(([key, option]) => {
                            const value = options[key as keyof typeof options] as unknown;
                            const label = capitalize(key);
                            if (option.type === "boolean") {
                                return (
                                    <label key={key} className="row" title={option.description}>
                                        <span>{label}</span>
                                        <input
                                            type="checkbox"
                                            checked={value === true}
                                            disabled={!on}
                                            onChange={(e) =>
                                                update(name, { option: [key, e.target.checked] })
                                            }
                                        />
                                    </label>
                                );
                            }
                            const min = option.minimum ?? 0;
                            const max = option.maximum ?? 1;
                            const step =
                                option.type === "integer" ? 1 : max - min <= 1 ? 0.01 : 0.5;
                            return (
                                <label key={key} className="row" title={option.description}>
                                    <span>{label}</span>
                                    <input
                                        type="range"
                                        min={min}
                                        max={max}
                                        step={step}
                                        value={Number(value)}
                                        disabled={!on}
                                        onChange={(e) =>
                                            update(name, { option: [key, Number(e.target.value)] })
                                        }
                                    />
                                    <output>{Number(value)}</output>
                                </label>
                            );
                        })}
                    </fieldset>
                );
            })}
        </div>
    );
}
