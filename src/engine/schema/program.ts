import { z } from "zod";
import { fillRecipe, type Recipe, RecipeSchema } from "../sound/recipe.ts";
import type { Align } from "../text/layout.ts";
import {
    DEFAULT_FONT,
    DEFAULT_FONT_SCALE,
    DEFAULT_LINE_SPACING,
    type FontId,
    FontScaleSchema,
    FontSchema,
    LineSpacingSchema,
    type Palette,
    resolveTheme,
    ThemeSchema,
    type ThemeSetting,
} from "./appearance.ts";
import { type BarLine, BarSchema, barActions } from "./bars.ts";
import {
    type Action,
    AlignSchema,
    GlitchOptionsSchema,
    IdSchema,
    type RevealOption,
    RevealSchema,
    SoundNameSchema,
    TeletypeOptionsSchema,
    type TransitionOption,
    TransitionSchema,
} from "./common.ts";
import { type Dialog, DialogSchema, dialogAction } from "./dialog.ts";
import { EffectsSchema, type EffectsSetting } from "./effects.ts";
import {
    boundVariable,
    ContentSchema,
    type Element,
    forEachElement,
    moduleFor,
} from "./elements.ts";
import { DEFAULT_SKIP_KEYS, type NextRule, NextSchema, SkipKeysSchema } from "./next.ts";
import { expandPreset, PresetSchema, parseContent } from "./presets.ts";
import { type ResolvedSound, resolveSound, SoundSchema, type SoundSetting } from "./sound.ts";
import { type Timer, TimersSchema } from "./timers.ts";
import {
    type Condition,
    checkAssignments,
    checkCondition,
    unknownVariable,
    VariablesSchema,
    type VariableValue,
} from "./variables.ts";

export type { Dialog } from "./dialog.ts";

export const DEFAULT_TELETYPE_SPEED = 10;
export const DEFAULT_GLITCH_DURATION = 1000;

// ─── Authoring schema (what a JSON file contains) ────────────────────────────

export const ScreenSchema = z
    .strictObject({
        reveal: RevealSchema.optional().meta({
            description: "Default reveal for this screen's elements",
        }),
        transition: TransitionSchema.optional().meta({
            description: "How the previous screen leaves when this one is shown",
        }),
        effects: EffectsSchema.optional().meta({
            description: "Effects for this screen, layered over the config's",
        }),
        autoscroll: z.boolean().optional().meta({
            description: "Keep new content in view as it appears (default: the config's)",
        }),
        align: AlignSchema.optional().meta({
            description:
                "Where text, links and toggles sit across the screen, unless they say " +
                "otherwise (default: the config's)",
        }),
        waitForReveal: z
            .boolean()
            .optional()
            .meta({
                description:
                    "Make links, toggles, sliders, sections and prompts usable only once the whole " +
                    "screen has revealed (default: the config's)",
            }),
        header: z
            .union([BarSchema, z.literal(false)])
            .optional()
            .meta({
                description:
                    "A header bar for this screen instead of the config's, or false for none",
            }),
        footer: z
            .union([BarSchema, z.literal(false)])
            .optional()
            .meta({
                description:
                    "A status bar for this screen instead of the config's, or false for none",
            }),
        next: NextSchema.optional(),
        sound: SoundNameSchema.optional().meta({
            description: "A sound from the program's sounds, played as the screen appears",
        }),
        preset: PresetSchema.optional().meta({
            description:
                'A ready-made screen, e.g. { "type": "boot" }, shown before any content of its own',
        }),
        content: z.array(ContentSchema).optional().meta({
            description:
                "The elements, revealed in order. Can be empty; can be left out with a preset.",
        }),
    })
    .refine((screen) => screen.content !== undefined || screen.preset !== undefined, {
        message: 'Give it "content", or a "preset"',
        path: ["content"],
    })
    .meta({
        description: "A screen of content. Its elements are revealed one after another.",
    });

export const DefaultsSchema = z
    .strictObject({
        teletype: TeletypeOptionsSchema.optional().meta({
            description: "Default teletype options",
        }),
        glitch: GlitchOptionsSchema.optional().meta({
            description: "Default glitch options, for reveals and transitions",
        }),
    })
    .meta({ description: "Default options for each kind of reveal" });

export const ConfigSchema = z
    .strictObject({
        name: z.string().meta({ description: "The program's name, shown as the page title" }),
        author: z.string().optional().meta({ description: "Who made it" }),
        description: z.string().optional().meta({ description: "What it is" }),
        start: IdSchema.optional().meta({
            description: "The first screen (default: the first one)",
        }),
        reveal: RevealSchema.optional().meta({
            description:
                'How text appears on every screen, unless a screen or element says otherwise (default: "teletype")',
        }),
        transition: TransitionSchema.optional().meta({
            description:
                'How screens leave, unless the next screen says otherwise (default: "none")',
        }),
        align: AlignSchema.optional().meta({
            description:
                "Where text, links and toggles sit across every screen, unless a screen or " +
                'element says otherwise (default: "left")',
        }),
        header: BarSchema.optional().meta({
            description:
                "A header bar pinned to the top of the window, on every screen unless it sets " +
                "its own. Its lines don't scroll or reveal, and show variables as they change.",
        }),
        footer: BarSchema.optional().meta({
            description:
                "A status bar pinned to the bottom of the window, on every screen unless it " +
                "sets its own. Its lines don't scroll or reveal, and show variables as they change.",
        }),
        waitForReveal: z
            .boolean()
            .optional()
            .meta({
                description:
                    "Make links, toggles, sliders, sections and prompts usable only once the " +
                    "whole screen has revealed, as on a real terminal, rather than each as it " +
                    "appears. A tap still finishes the reveal at once (default: false)",
            }),
        defaults: DefaultsSchema.optional(),
        variables: VariablesSchema.optional(),
        timers: TimersSchema.optional(),
        skipKeys: SkipKeysSchema.optional(),
        theme: ThemeSchema.optional(),
        font: FontSchema.optional(),
        fontScale: FontScaleSchema.optional(),
        lineSpacing: LineSpacingSchema.optional(),
        effects: EffectsSchema.optional(),
        sound: SoundSchema.optional(),
        save: z
            .boolean()
            .optional()
            .meta({
                description:
                    "Save the player's progress in the browser as they go (the screen, variables, " +
                    "timers, and what every element remembers), and carry on from it when the " +
                    'page is opened again. A "restart" action starts over (default: false)',
            }),
        blockContextMenu: z
            .boolean()
            .optional()
            .meta({
                description:
                    "Block the browser's right-click menu, so the program feels like a terminal " +
                    "rather than a web page. Text fields keep theirs (default: true)",
            }),
        autoscroll: z
            .boolean()
            .optional()
            .meta({
                description:
                    "Scroll to keep new content in view as it appears, unless the reader has scrolled " +
                    "up (default: true)",
            }),
    })
    .meta({
        description:
            "Settings for the whole program. `reveal`, `transition`, `effects` and `autoscroll` apply to every screen unless it sets its own.",
    });

/** The shape of a Teletronix JSON file, before normalization. Used to generate the JSON Schema. */
export const FileSchema = z
    .strictObject({
        $schema: z.string().optional().meta({
            description:
                "Path or URL of teletronix.schema.json, for checking and autocomplete in editors",
        }),
        config: ConfigSchema.meta({ description: "Settings for the whole program" }),
        screens: z.record(IdSchema, ScreenSchema).meta({
            description: "The screens, by id. Links, commands and `next` refer to them by id.",
        }),
        dialogs: z
            .record(IdSchema, DialogSchema)
            .optional()
            .meta({ description: "The dialogs, by id. Actions open them by id." }),
        sounds: z
            .record(IdSchema, RecipeSchema)
            .optional()
            .meta({
                description:
                    'Sound effects, by name, for "sound" on actions, elements, screens and ' +
                    "dialogs. Design them on the sound test page (?sound, Custom tab). Named " +
                    '"key", "select", "tick", "error", "dialog" or "alert", one replaces ' +
                    "Teletronix's own sound of that kind.",
            }),
    })
    .meta({
        title: "Teletronix program",
        description: "A Teletronix program: its settings, screens, dialogs and sounds",
    });

export type TeletronixFile = z.input<typeof FileSchema>;

// ─── Normalized program (what the engine runs) ───────────────────────────────

export interface Defaults {
    reveal: RevealOption;
    align: Align;
    waitForReveal: boolean;
    transition: TransitionOption;
    teletype: { speed: number };
    glitch: { duration: number };
}

export interface Screen {
    id: string;
    reveal?: RevealOption;
    transition?: TransitionOption;
    effects?: EffectsSetting;
    autoscroll?: boolean;
    align?: Align;
    waitForReveal?: boolean;
    /** Its own bars, or false for none (default: the program's). */
    header?: BarLine[] | false;
    footer?: BarLine[] | false;
    next?: NextRule[];
    sound?: string;
    content: Element[];
}

export interface Program {
    config: { name: string; author?: string; description?: string };
    start: string;
    defaults: Defaults;
    effects?: EffectsSetting;
    autoscroll: boolean;
    blockContextMenu: boolean;
    /** Save progress in the browser, and carry on from it */
    save: boolean;
    /** Sound as written (for tools that edit it), and resolved */
    soundSetting?: SoundSetting;
    sound: ResolvedSound | null;
    /** The theme as written (for tools that edit it), and its colors. */
    theme?: ThemeSetting;
    palette: Palette;
    font: FontId;
    /** How much bigger (or smaller) than usual text is */
    fontScale: number;
    /** How far apart lines are, as a multiple of the text's size */
    lineSpacing: number;
    screens: ReadonlyMap<string, Screen>;
    dialogs: ReadonlyMap<string, Dialog>;
    /** Sound effects by name, each filled in */
    sounds: ReadonlyMap<string, Recipe>;
    /** Bars pinned to the top and bottom of the window, unless a screen has its own */
    header?: BarLine[];
    footer?: BarLine[];
    /** Keys that finish a screen's reveal, when nothing else wants them (normalized) */
    skipKeys: string[];
    /** Timers by name: clocks that keep running from screen to screen */
    timers: ReadonlyMap<string, Timer>;
    /** Variables by name, with their starting values */
    variables: ReadonlyMap<string, VariableValue>;
}

/** The program as the engine runs it, from the file as parsed and (for presets) as written. */
function normalize(
    file: z.output<typeof FileSchema>,
    written: unknown,
    ctx: z.RefinementCtx,
): Program {
    const {
        start,
        reveal,
        transition,
        align,
        waitForReveal,
        header,
        footer,
        defaults,
        effects,
        autoscroll,
        blockContextMenu,
        save,
        sound,
        theme,
        font,
        fontScale,
        lineSpacing,
        variables,
        timers,
        skipKeys,
        ...config
    } = file.config;

    const screens = new Map<string, Screen>();
    // (an empty `screens` is reported by the reference check below)
    const firstScreen = start ?? Object.keys(file.screens)[0] ?? "";
    for (const [id, screen] of Object.entries(file.screens)) {
        const writtenPreset = (written as { screens?: Record<string, { preset?: unknown }> })
            ?.screens?.[id]?.preset;
        const preset = screen.preset && expandPreset(screen.preset, firstScreen, writtenPreset);
        // what a preset makes is checked like any content; its problems are the preset's
        const presetContent = (content: unknown[]) => {
            const parsed = parseContent(content);
            if (parsed.success) return parsed.data;
            for (const issue of parsed.error.issues) {
                ctx.addIssue({
                    code: "custom",
                    path: ["screens", id, "preset"],
                    message: issue.message,
                });
            }
            return [];
        };
        const items = preset
            ? [
                  ...presetContent(preset.before),
                  ...(screen.content ?? []),
                  ...presetContent(preset.after),
              ]
            : (screen.content ?? []);
        const content = normalizeContent(items, `${id}#`);
        const { reveal, transition, autoscroll, align, waitForReveal } = screen;
        const effects = screen.effects ?? preset?.effects;
        const { sound } = screen;
        const header = screen.header ?? preset?.header;
        const footer = screen.footer ?? preset?.footer;
        const rules = [...(screen.next ?? []), ...(preset?.next ? [preset.next] : [])];
        const next = rules.length > 0 ? rules : undefined;
        screens.set(id, {
            id,
            reveal,
            transition,
            effects,
            autoscroll,
            align,
            waitForReveal,
            header,
            footer,
            next,
            sound,
            content,
        });
    }

    const dialogs = new Map<string, Dialog>();
    for (const [id, dialog] of Object.entries(file.dialogs ?? {})) {
        dialogs.set(id, { id, ...dialog });
    }

    return {
        config,
        start: firstScreen,
        defaults: {
            reveal: reveal ?? { type: "teletype" },
            align: align ?? "left",
            waitForReveal: waitForReveal ?? false,
            transition: transition ?? { type: "none" },
            teletype: { speed: defaults?.teletype?.speed ?? DEFAULT_TELETYPE_SPEED },
            glitch: { duration: defaults?.glitch?.duration ?? DEFAULT_GLITCH_DURATION },
        },
        effects,
        autoscroll: autoscroll ?? true,
        blockContextMenu: blockContextMenu ?? true,
        save: save ?? false,
        soundSetting: sound,
        sound: resolveSound(sound),
        theme,
        palette: resolveTheme(theme),
        font: font ?? DEFAULT_FONT,
        fontScale: fontScale ?? DEFAULT_FONT_SCALE,
        lineSpacing: lineSpacing ?? DEFAULT_LINE_SPACING,
        screens,
        dialogs,
        sounds: new Map(
            Object.entries(file.sounds ?? {}).map(([name, recipe]) => [name, fillRecipe(recipe)]),
        ),
        variables: new Map(Object.entries(variables ?? {})),
        timers: new Map(Object.entries(timers ?? {})),
        skipKeys: skipKeys ?? DEFAULT_SKIP_KEYS,
        header,
        footer,
    };
}

/**
 * Gives every element an id (`<screen>#<index>`, and `<section id>.<index>` inside a
 * section) and turns bare strings into text elements.
 */
function normalizeContent(items: readonly unknown[], prefix: string): Element[] {
    return items.map((item, index): Element => {
        const id = `${prefix}${index}`;
        if (typeof item === "string") return { type: "text", text: item, wrap: true, id };
        const element = { ...(item as Element), id };
        if (element.type === "section" || element.type === "columns") {
            element.content = normalizeContent(element.content, `${id}.`);
        }
        return element;
    });
}

/** Cross-reference checks that a JSON Schema can't express. */
function checkReferences(program: Program, ctx: z.RefinementCtx): void {
    if (program.screens.size === 0) {
        ctx.addIssue({ code: "custom", path: ["screens"], message: "Add at least one screen" });
        return;
    }

    if (!program.screens.has(program.start)) {
        ctx.addIssue({
            code: "custom",
            path: ["config", "start"],
            message: `Unknown start screen "${program.start}"`,
        });
    }

    const unknownSound = (name: string | undefined) =>
        name !== undefined && !program.sounds.has(name) ? `Unknown sound "${name}"` : null;
    // conditions can test timers too, as their seconds
    const testable = new Map<string, VariableValue>(program.variables);
    for (const name of program.timers.keys()) testable.set(name, 0);
    const conditionProblems = (condition: Condition | undefined) =>
        condition ? checkCondition(condition, testable) : [];
    const unknownTimer = (name: string | undefined) =>
        name !== undefined && !program.timers.has(name)
            ? [`Unknown timer "${name}" (declare it in config.timers)`]
            : [];
    const actionProblems = (action: Action): string[] =>
        action.flatMap((choice) => [
            ...[choice.screen ?? []]
                .flat()
                .filter((id) => !program.screens.has(id))
                .map((id) => `Unknown screen "${id}"`),
            ...[choice.dialog ?? []]
                .flat()
                .filter((id) => !program.dialogs.has(id))
                .map((id) => `Unknown dialog "${id}"`),
            ...[unknownSound(choice.sound) ?? []].flat(),
            ...conditionProblems(choice.if),
            ...checkAssignments(choice.set ?? [], program.variables),
            ...unknownTimer(choice.startTimer),
            ...unknownTimer(choice.stopTimer),
            ...unknownTimer(choice.resetTimer),
        ]);
    const report = (path: PropertyKey[], messages: string | string[] | null) => {
        for (const message of [messages ?? []].flat()) {
            ctx.addIssue({ code: "custom", path, message });
        }
    };

    const checkBar = (path: PropertyKey[], bar: readonly BarLine[] | false | undefined) => {
        for (const link of bar ? barActions(bar) : []) {
            report([...path, ...link.path], actionProblems(link.action));
        }
    };
    for (const [name, timer] of program.timers) {
        if (program.variables.has(name)) {
            report(
                ["config", "timers", name],
                `"${name}" is a variable already; name the timer differently`,
            );
        }
        if (timer.onComplete)
            report(["config", "timers", name, "onComplete"], actionProblems(timer.onComplete));
    }
    checkBar(["config", "header"], program.header);
    checkBar(["config", "footer"], program.footer);

    for (const dialog of program.dialogs.values()) {
        report(["dialogs", dialog.id, "sound"], unknownSound(dialog.sound));
        for (const [answer, confirmed] of [
            ["confirm", true],
            ["cancel", false],
        ] as const) {
            const action = dialogAction(dialog, confirmed);
            if (action) report(["dialogs", dialog.id, answer, "action"], actionProblems(action));
        }
    }

    for (const screen of program.screens.values()) {
        report(["screens", screen.id, "sound"], unknownSound(screen.sound));
        checkBar(["screens", screen.id, "header"], screen.header);
        checkBar(["screens", screen.id, "footer"], screen.footer);

        screen.next?.forEach((rule, index) => {
            const path = ["screens", screen.id, "next", index];
            report([...path, "if"], conditionProblems(rule.if));
            report([...path, "action"], actionProblems(rule.action));
        });

        forEachElement(screen.content, (element, at) => {
            const path = ["screens", screen.id, "content", ...at];
            const module = moduleFor(element);
            report([...path, "sound"], unknownSound(element.sound));
            report([...path, "if"], conditionProblems(element.if));
            for (const condition of module.conditions?.(element) ?? []) {
                report(path, conditionProblems(condition));
            }
            for (const action of module.actions?.(element) ?? []) {
                report(path, actionProblems(action));
            }

            if (element.type === "timer") report([...path, "timer"], unknownTimer(element.timer));
            // a multiple choice's option variables must be true/false
            module.multiBinding?.variables(element).forEach((name, i) => {
                if (name === null) return;
                const value = program.variables.get(name);
                report(
                    [...path, "variables", i],
                    value === undefined
                        ? unknownVariable(name)
                        : typeof value === "boolean"
                          ? null
                          : `"${name}" must be true or false`,
                );
            });
            const source = module.source?.(element);
            if (source !== undefined) {
                const value = testable.get(source);
                report(
                    [...path, "variable"],
                    value === undefined
                        ? `Unknown variable or timer "${source}"`
                        : typeof value === "number"
                          ? null
                          : `"${source}" isn't a number`,
                );
            }
            const variable = boundVariable(element);
            if (variable !== undefined) {
                const initial = program.variables.get(variable);
                report(
                    [...path, "variable"],
                    initial === undefined
                        ? unknownVariable(variable)
                        : (module.binding?.check(element, initial) ?? null),
                );
            }
        });
    }
}

/** The schema a program file is parsed with: given the file as written, for its presets. */
const programSchema = (written: unknown) =>
    FileSchema.transform((file, ctx) => normalize(file, written, ctx)).superRefine(checkReferences);

// ─── Parsing ─────────────────────────────────────────────────────────────────

export interface ParseError {
    /** Where the problem is, e.g. `screens.home.content[2].action` */
    path: string;
    message: string;
}

export type ParseResult = { ok: true; program: Program } | { ok: false; errors: ParseError[] };

export function parseProgram(input: unknown): ParseResult {
    const result = programSchema(input).safeParse(input);
    if (result.success) {
        return { ok: true, program: result.data };
    }

    return {
        ok: false,
        errors: result.error.issues.flatMap(explain).map((issue) => ({
            path: formatPath(issue.path),
            message: issue.message,
        })),
    };
}

type Issue = z.core.$ZodIssue;

/**
 * When a value can take several shapes (e.g. a string or an element) and matches none,
 * Zod reports only "Invalid input". Report the problems with the closest shape instead:
 * the one that didn't fail outright on the value's type.
 */
function explain(issue: Issue): Issue[] {
    // a bad key in a map (e.g. a screen id), with the reason inside
    if (issue.code === "invalid_key" && issue.issues.length > 0) {
        return issue.issues.map((inner) => ({ ...inner, path: issue.path }) as Issue);
    }
    if (issue.code !== "invalid_union" || issue.errors.length === 0) return [issue];

    const wrongType = (branch: Issue[]) =>
        branch.filter((i) => i.code === "invalid_type" && i.path.length === 0).length;
    const depth = (branch: Issue[]) => Math.max(0, ...branch.map((i) => i.path.length));
    const [closest] = [...issue.errors].sort(
        (a, b) => wrongType(a) - wrongType(b) || depth(b) - depth(a),
    );

    return (closest ?? []).flatMap((inner) =>
        explain({ ...inner, path: [...issue.path, ...inner.path] } as Issue),
    );
}

function formatPath(path: readonly PropertyKey[]): string {
    return path.reduce<string>((out, key) => {
        if (typeof key === "number") return `${out}[${key}]`;
        const name = String(key);
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) return `${out}[${JSON.stringify(name)}]`;
        return out ? `${out}.${name}` : name;
    }, "");
}
