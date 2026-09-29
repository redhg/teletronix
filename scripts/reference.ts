// Generates docs/reference.md from the schema, so the reference can't drift from what
// Teletronix accepts. Every property needs a description (see scripts/reference.test.ts).

import { z } from "zod";
import { BloomOptionsSchema } from "../src/effects/bloom/definition.ts";
import { FlickerOptionsSchema } from "../src/effects/flicker/definition.ts";
import { FringeOptionsSchema } from "../src/effects/fringe/definition.ts";
import { ScanlinesOptionsSchema } from "../src/effects/scanlines/definition.ts";
import { StaticOptionsSchema } from "../src/effects/static/definition.ts";
import { VignetteOptionsSchema } from "../src/effects/vignette/definition.ts";
import { CustomThemeSchema, ThemeSchema } from "../src/engine/schema/appearance.ts";
import {
    BarLineObjectSchema,
    BarLineSchema,
    BarLinkSchema,
    BarSchema,
    BarSlotSchema,
} from "../src/engine/schema/bars.ts";
import {
    ActionCaseSchema,
    ActionSchema,
    FadeTransitionSchema,
    GlitchOptionsSchema,
    GlitchRevealSchema,
    GlitchTransitionSchema,
    InstantRevealSchema,
    NoneTransitionSchema,
    RevealSchema,
    StaticTransitionSchema,
    TeletypeOptionsSchema,
    TeletypeRevealSchema,
    TransitionSchema,
} from "../src/engine/schema/common.ts";
import {
    AlertSchema,
    CancelButtonSchema,
    ConfirmButtonSchema,
    ConfirmSchema,
} from "../src/engine/schema/dialog.ts";
import { EffectsSchema } from "../src/engine/schema/effects.ts";
import { ColumnsSchema, ContentSchema, SectionSchema } from "../src/engine/schema/elements.ts";
import { RuleSchema } from "../src/engine/schema/next.ts";
import {
    ConfigSchema,
    DefaultsSchema,
    FileSchema,
    ScreenSchema,
} from "../src/engine/schema/program.ts";
import { SoundOptionsSchema, SoundSchema } from "../src/engine/schema/sound.ts";
import { TimerSchema, TimersSchema } from "../src/engine/schema/timers.ts";
import {
    AddSchema,
    AllConditionSchema,
    AnyConditionSchema,
    AssignmentsSchema,
    ComparisonSchema,
    ConditionSchema,
    NotConditionSchema,
    VariablesSchema,
    VariableTestsSchema,
} from "../src/engine/schema/variables.ts";
import { RecipeSchema } from "../src/engine/sound/recipe.ts";
import {
    VOICE_PARAMS,
    type VoiceName,
    VoicesSchema,
    voiceSchema,
} from "../src/engine/sound/voices.ts";
import { BitmapSchema, BlendObjectSchema, BlendSchema } from "../src/modules/bitmap/definition.ts";
import { ButtonSchema, ButtonsSchema } from "../src/modules/buttons/definition.ts";
import { ChoiceMarkersSchema, ChoiceSchema } from "../src/modules/choice/definition.ts";
import { LinkSchema } from "../src/modules/link/definition.ts";
import { MeterRangeSchema, MeterSchema } from "../src/modules/meter/definition.ts";
import { NumberRuleSchema, NumberSchema } from "../src/modules/number/definition.ts";
import { PauseSchema } from "../src/modules/pause/definition.ts";
import {
    DelayedActionSchema,
    InterruptSchema,
    OutcomeSchema,
    ProgressSchema,
} from "../src/modules/progress/definition.ts";
import { CommandSchema, PromptSchema } from "../src/modules/prompt/definition.ts";
import { SectionMarkersSchema } from "../src/modules/section/definition.ts";
import { SliderRuleSchema, SliderSchema } from "../src/modules/slider/definition.ts";
import { TableColumnSchema, TableSchema } from "../src/modules/table/definition.ts";
import { TextSchema } from "../src/modules/text/definition.ts";
import { TimerElementSchema } from "../src/modules/timer/definition.ts";
import { ToggleSchema } from "../src/modules/toggle/definition.ts";

interface JsonSchema {
    $ref?: string;
    $defs?: Record<string, JsonSchema>;
    type?: string | string[];
    description?: string;
    default?: unknown;
    const?: unknown;
    enum?: unknown[];
    anyOf?: JsonSchema[];
    oneOf?: JsonSchema[];
    properties?: Record<string, JsonSchema>;
    required?: string[];
    items?: JsonSchema;
    additionalProperties?: JsonSchema | boolean;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
}

interface Named {
    title: string;
    id: string;
    json: JsonSchema;
    /** Shown after the title, e.g. the element's `"type"`. */
    note?: string;
}

const GROUPS: [string, [string, z.ZodType, string?][]][] = [
    [
        "Program",
        [
            ["Program", FileSchema],
            ["Config", ConfigSchema],
            ["Defaults", DefaultsSchema],
            ["Teletype options", TeletypeOptionsSchema],
            ["Glitch options", GlitchOptionsSchema],
            ["Screen", ScreenSchema],
            ["Next rule", RuleSchema],
        ],
    ],
    [
        "Bars",
        [
            ["Bar", BarSchema],
            ["Bar line", BarLineSchema],
            ["Bar line slots", BarLineObjectSchema],
            ["Bar slot", BarSlotSchema],
            ["Bar link", BarLinkSchema],
        ],
    ],
    [
        "Variables",
        [
            ["Variables", VariablesSchema],
            ["Condition", ConditionSchema],
            ["Variable tests", VariableTestsSchema],
            ["Comparison", ComparisonSchema],
            ["All", AllConditionSchema],
            ["Any", AnyConditionSchema],
            ["Not", NotConditionSchema],
            ["Set", AssignmentsSchema],
            ["Add", AddSchema],
            ["Timers", TimersSchema],
            ["Timer", TimerSchema],
        ],
    ],
    [
        "Elements",
        [
            ["Content", ContentSchema],
            ["Text", TextSchema, '"type": "text", or a bare string'],
            ["Link", LinkSchema, '"type": "link"'],
            ["Toggle", ToggleSchema, '"type": "toggle"'],
            ["Choice", ChoiceSchema, '"type": "choice"'],
            ["Choice markers", ChoiceMarkersSchema],
            ["Prompt", PromptSchema, '"type": "prompt"'],
            ["Prompt command", CommandSchema],
            ["Number", NumberSchema, '"type": "number"'],
            ["Number rule", NumberRuleSchema],
            ["Timer element", TimerElementSchema, '"type": "timer"'],
            ["Bitmap", BitmapSchema, '"type": "bitmap"'],
            ["Blend", BlendSchema],
            ["Blend with a color", BlendObjectSchema],
            ["Progress", ProgressSchema, '"type": "progress"'],
            ["Progress outcome", OutcomeSchema],
            ["Delayed action", DelayedActionSchema],
            ["Progress interrupt", InterruptSchema],
            ["Slider", SliderSchema, '"type": "slider"'],
            ["Slider rule", SliderRuleSchema],
            ["Meter", MeterSchema, '"type": "meter"'],
            ["Meter range", MeterRangeSchema],
            ["Table", TableSchema, '"type": "table"'],
            ["Table column", TableColumnSchema],
            ["Section", SectionSchema, '"type": "section"'],
            ["Section markers", SectionMarkersSchema],
            ["Columns", ColumnsSchema, '"type": "columns"'],
            ["Pause", PauseSchema, '"type": "pause"'],
            ["Buttons", ButtonsSchema, '"type": "buttons"'],
            ["Button", ButtonSchema],
        ],
    ],
    [
        "Dialogs",
        [
            ["Alert", AlertSchema, '"type": "alert"'],
            ["Confirm", ConfirmSchema, '"type": "confirm"'],
            ["Confirm button", ConfirmButtonSchema],
            ["Cancel button", CancelButtonSchema],
        ],
    ],
    [
        "Appearance",
        [
            ["Theme", ThemeSchema],
            ["Custom theme", CustomThemeSchema],
            ["Sound", SoundSchema],
            ["Sound options", SoundOptionsSchema],
            ["Sound recipe", RecipeSchema],
            ["Sound voices", VoicesSchema],
            ...(Object.keys(VOICE_PARAMS) as VoiceName[]).map((name): [string, z.ZodType] => [
                `${VOICE_PARAMS[name].label} voice`,
                voiceSchema(name),
            ]),
        ],
    ],
    [
        "Effects",
        [
            ["Effects", EffectsSchema],
            ["Scanlines", ScanlinesOptionsSchema, '"scanlines"'],
            ["Static", StaticOptionsSchema, '"static"'],
            ["Bloom", BloomOptionsSchema, '"bloom"'],
            ["Vignette", VignetteOptionsSchema, '"vignette"'],
            ["Flicker", FlickerOptionsSchema, '"flicker"'],
            ["Fringe", FringeOptionsSchema, '"fringe"'],
        ],
    ],
    [
        "Shared types",
        [
            ["Action", ActionSchema],
            ["Action case", ActionCaseSchema],
            ["Reveal", RevealSchema],
            ["Teletype reveal", TeletypeRevealSchema, '"type": "teletype"'],
            ["Glitch reveal", GlitchRevealSchema, '"type": "glitch"'],
            ["Instant reveal", InstantRevealSchema, '"type": "instant"'],
            ["Transition", TransitionSchema],
            ["No transition", NoneTransitionSchema, '"type": "none"'],
            ["Glitch transition", GlitchTransitionSchema, '"type": "glitch"'],
            ["Fade transition", FadeTransitionSchema, '"type": "fade"'],
            ["Static transition", StaticTransitionSchema, '"type": "static"'],
        ],
    ],
];

/** Where a named type (one with a meta id, such as a recursive one) is referred to. */
const REF = "#/$defs/";

const toJson = (schema: z.ZodType): JsonSchema => {
    const {
        $schema: _,
        $defs: defs = {},
        ...json
    } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema & {
        $schema?: string;
    };
    // a named type on its own is a reference to itself: document what it refers to
    let resolved: JsonSchema = json;
    while (resolved.$ref?.startsWith(REF) && Object.keys(resolved).length <= 2) {
        const { $ref, ...rest } = resolved;
        resolved = { ...defs[$ref.slice(REF.length)], ...rest };
    }
    return resolved;
};

/** The named types, by meta id, for references to them. */
const byId = new Map<string, Named>();

/** What makes two schemas the same type: everything but where-it's-used details. */
const shape = ({ description: _d, default: _f, ...rest }: JsonSchema) => JSON.stringify(rest);

const DEFAULT_IN_TEXT = /\s*\(default: (.+)\)$/;

/** Formats a default written in prose as code when it's a literal value, e.g. `"teletype"`. */
const literal = (text: string) =>
    /^(".*"|-?\d+(\.\d+)?|true|false)$/.test(text) ? `\`${text}\`` : text;

const slug = (title: string) => title.toLowerCase().replaceAll(" ", "-");
const code = (value: unknown) => `\`${JSON.stringify(value)}\``;
const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll("\n", " ");

export function generateReference(): { markdown: string; missing: string[] } {
    const named: Named[] = GROUPS.flatMap(([, entries]) =>
        entries.map(([title, schema, note]) => ({
            title,
            id: slug(title),
            json: toJson(schema),
            note,
        })),
    );
    const byShape = new Map<string, Named>();
    for (const entry of named) {
        const schema = GROUPS.flatMap(([, entries]) => entries).find(
            ([title]) => title === entry.title,
        )?.[1];
        const metaId = schema && (z.globalRegistry.get(schema) as { id?: string } | undefined)?.id;
        if (metaId) byId.set(metaId, entry);
        const key = shape(entry.json);
        if (byShape.has(key))
            throw new Error(`${entry.title} has the same shape as ${byShape.get(key)?.title}`);
        byShape.set(key, entry);
    }

    const missing: string[] = [];
    const link = (entry: Named) => `[${entry.title}](#${entry.id})`;

    const typeOf = (json: JsonSchema, self?: Named): string => {
        if (json.$ref?.startsWith(REF)) {
            const target = byId.get(json.$ref.slice(REF.length));
            if (!target) throw new Error(`No reference entry for ${json.$ref}`);
            return link(target);
        }
        const known = byShape.get(shape(json));
        if (known && known !== self) return link(known);
        if (json.const !== undefined) return code(json.const);
        if (json.enum) return json.enum.map(code).join(" | ");
        const alternatives = json.anyOf ?? json.oneOf;
        if (alternatives) return [...new Set(alternatives.map((a) => typeOf(a)))].join(" | ");
        if (Array.isArray(json.type)) return json.type.join(" | ");

        switch (json.type) {
            case "array": {
                const item = typeOf(json.items ?? {});
                return item.includes(" | ") ? `(${item})[]` : `${item}[]`;
            }
            case "object":
                if (typeof json.additionalProperties === "object") {
                    return `map of id → ${typeOf(json.additionalProperties)}`;
                }
                throw new Error(`Unnamed object type: ${JSON.stringify(json).slice(0, 120)}`);
            case "number":
            case "integer": {
                const kind = json.type === "integer" ? "whole number" : "number";
                // Zod gives whole numbers a maximum of Number.MAX_SAFE_INTEGER; that's no limit
                const maximum =
                    json.maximum !== undefined && json.maximum < Number.MAX_SAFE_INTEGER
                        ? json.maximum
                        : undefined;
                if (json.minimum !== undefined && maximum !== undefined) {
                    return `${kind}, ${json.minimum}–${maximum}`;
                }
                if (json.exclusiveMinimum !== undefined)
                    return `${kind}, > ${json.exclusiveMinimum}`;
                if (json.minimum !== undefined) return `${kind}, ≥ ${json.minimum}`;
                return kind;
            }
            case "string":
                if (json.pattern) return "id";
                if (json.minLength === 1 && json.maxLength === 1) return "character";
                return "string";
            case "boolean":
                return "boolean";
            default:
                return "any";
        }
    };

    const table = (entry: Named): string[] => {
        const properties = Object.entries(entry.json.properties ?? {}).filter(
            ([name, property]) => !(name === "type" && property.const !== undefined),
        );
        if (properties.length === 0) return ["No options."];
        const required = new Set(entry.json.required ?? []);
        return [
            "| Property | Type | Default | Description |",
            "|---|---|---|---|",
            ...properties.map(([name, property]) => {
                if (!property.description) missing.push(`${entry.title}.${name}`);
                // a default written as "(default: …)" in the description goes in its own column
                const written = DEFAULT_IN_TEXT.exec(property.description ?? "");
                const description = (property.description ?? "").replace(DEFAULT_IN_TEXT, "");
                const fallback =
                    property.default !== undefined
                        ? code(property.default)
                        : written
                          ? literal(written[1] ?? "")
                          : required.has(name)
                            ? "**required**"
                            : "";
                return `| \`${name}\` | ${cell(typeOf(property, entry))} | ${cell(fallback)} | ${cell(description)} |`;
            }),
        ];
    };

    const union = (entry: Named): string[] => {
        const alternatives = (entry.json.anyOf ?? entry.json.oneOf ?? []).flatMap(
            (a) => a.oneOf ?? a.anyOf ?? [a],
        );
        return [
            "One of:",
            "",
            ...alternatives.map((alternative) => {
                const known = byShape.get(shape(alternative));
                const note = known
                    ? ""
                    : alternative.description
                      ? `: ${alternative.description}`
                      : "";
                return `- ${typeOf(alternative)}${note}`;
            }),
        ];
    };

    const section = (entry: Named): string[] => {
        if (!entry.json.description) missing.push(entry.title);
        const isObject = entry.json.type === "object" && entry.json.properties;
        if (entry.json.type === "array") {
            return [
                `<a id="${entry.id}"></a>`,
                "",
                `### ${entry.title}`,
                "",
                ...(entry.json.description ? [entry.json.description, ""] : []),
                `A list of ${typeOf(entry.json.items ?? {})}.`,
                "",
            ];
        }
        const map = entry.json.additionalProperties;
        if (entry.json.type === "object" && !isObject && typeof map === "object") {
            return [
                `<a id="${entry.id}"></a>`,
                "",
                `### ${entry.title}`,
                "",
                ...(entry.json.description ? [entry.json.description, ""] : []),
                `A map of variable name → ${typeOf(map)}.`,
                "",
            ];
        }
        return [
            `<a id="${entry.id}"></a>`,
            "",
            `### ${entry.title}${entry.note ? ` (\`${entry.note}\`)` : ""}`,
            "",
            ...(entry.json.description ? [entry.json.description, ""] : []),
            ...(isObject ? table(entry) : union(entry)),
            "",
        ];
    };

    const lines = [
        "# Teletronix program reference",
        "",
        "<!-- Generated by `npm run gen` from the schema. Don't edit by hand. -->",
        "",
        "Every property a Teletronix JSON file can use. For a guided tour with examples, see the",
        "[README](../README.md); for validation and autocomplete in your editor, point `$schema` at",
        "[`schema/teletronix.schema.json`](../schema/teletronix.schema.json).",
        "",
        ...GROUPS.flatMap(([group, entries]) => [
            `- **${group}:** ${entries.map(([title]) => `[${title}](#${slug(title)})`).join(", ")}`,
        ]),
        "",
    ];
    let index = 0;
    for (const [group, entries] of GROUPS) {
        lines.push(`## ${group}`, "");
        for (const _ of entries) lines.push(...section(named[index++] as Named));
    }

    return { markdown: `${lines.join("\n").trimEnd()}\n`, missing };
}
