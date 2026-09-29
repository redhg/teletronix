import { z } from "zod";
import { fillRecipe, type Recipe, RecipeSchema } from "../sound/recipe.ts";
import type { Align } from "../text/layout.ts";
import {
    DEFAULT_FONT,
    type FontId,
    FontSchema,
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
import { type NextRule, NextSchema } from "./next.ts";
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
        content: z
            .array(ContentSchema)
            .meta({ description: "The elements, revealed in order. Can be empty." }),
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
        theme: ThemeSchema.optional(),
        font: FontSchema.optional(),
        effects: EffectsSchema.optional(),
        sound: SoundSchema.optional(),
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
    /** Sound as written (for tools that edit it), and resolved */
    soundSetting?: SoundSetting;
    sound: ResolvedSound | null;
    /** The theme as written (for tools that edit it), and its colors. */
    theme?: ThemeSetting;
    palette: Palette;
    font: FontId;
    screens: ReadonlyMap<string, Screen>;
    dialogs: ReadonlyMap<string, Dialog>;
    /** Sound effects by name, each filled in */
    sounds: ReadonlyMap<string, Recipe>;
    /** Bars pinned to the top and bottom of the window, unless a screen has its own */
    header?: BarLine[];
    footer?: BarLine[];
    /** Timers by name: clocks that keep running from screen to screen */
    timers: ReadonlyMap<string, Timer>;
    /** Variables by name, with their starting values */
    variables: ReadonlyMap<string, VariableValue>;
}

function normalize(file: z.output<typeof FileSchema>): Program {
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
        sound,
        theme,
        font,
        variables,
        timers,
        ...config
    } = file.config;

    const screens = new Map<string, Screen>();
    for (const [id, screen] of Object.entries(file.screens)) {
        const content = normalizeContent(screen.content, `${id}#`);
        const { reveal, transition, effects, autoscroll, align, waitForReveal } = screen;
        const { header, footer, next, sound } = screen;
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
        // an empty `screens` is reported by the reference check below
        start: start ?? screens.keys().next().value ?? "",
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
        soundSetting: sound,
        sound: resolveSound(sound),
        theme,
        palette: resolveTheme(theme),
        font: font ?? DEFAULT_FONT,
        screens,
        dialogs,
        sounds: new Map(
            Object.entries(file.sounds ?? {}).map(([name, recipe]) => [name, fillRecipe(recipe)]),
        ),
        variables: new Map(Object.entries(variables ?? {})),
        timers: new Map(Object.entries(timers ?? {})),
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
            ...(choice.screen !== undefined && !program.screens.has(choice.screen)
                ? [`Unknown screen "${choice.screen}"`]
                : []),
            ...(choice.dialog !== undefined && !program.dialogs.has(choice.dialog)
                ? [`Unknown dialog "${choice.dialog}"`]
                : []),
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

export const ProgramSchema = FileSchema.transform(normalize).superRefine(checkReferences);

// ─── Parsing ─────────────────────────────────────────────────────────────────

export interface ParseError {
    /** Where the problem is, e.g. `screens.home.content[2].action` */
    path: string;
    message: string;
}

export type ParseResult = { ok: true; program: Program } | { ok: false; errors: ParseError[] };

export function parseProgram(input: unknown): ParseResult {
    const result = ProgramSchema.safeParse(input);
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
