import { z } from "zod";
import {
    type Action,
    GlitchOptionsSchema,
    IdSchema,
    type RevealOption,
    RevealSchema,
    TeletypeOptionsSchema,
    type TransitionOption,
    TransitionSchema,
} from "./common.ts";
import { type Dialog, DialogSchema, dialogAction } from "./dialog.ts";
import { EffectsSchema, type EffectsSetting } from "./effects.ts";
import { type Element, ElementSchema, moduleFor } from "./elements.ts";
import { type NextRule, NextSchema } from "./next.ts";

export type { Dialog } from "./dialog.ts";

export const DEFAULT_TELETYPE_SPEED = 10;
export const DEFAULT_GLITCH_DURATION = 1000;

// ─── Authoring schema (what a JSON file contains) ────────────────────────────

const ContentSchema = z.union([
    z.string().meta({ description: "Shorthand for a text element" }),
    ElementSchema,
]);

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
        next: NextSchema.optional(),
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
        defaults: DefaultsSchema.optional(),
        effects: EffectsSchema.optional(),
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
    })
    .meta({
        title: "Teletronix program",
        description: "A Teletronix program: its settings, screens and dialogs",
    });

export type TeletronixFile = z.input<typeof FileSchema>;

// ─── Normalized program (what the engine runs) ───────────────────────────────

export interface Defaults {
    reveal: RevealOption;
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
    next?: NextRule[];
    content: Element[];
}

export interface Program {
    config: { name: string; author?: string; description?: string };
    start: string;
    defaults: Defaults;
    effects?: EffectsSetting;
    autoscroll: boolean;
    screens: ReadonlyMap<string, Screen>;
    dialogs: ReadonlyMap<string, Dialog>;
}

function normalize(file: z.output<typeof FileSchema>): Program {
    const { start, reveal, transition, defaults, effects, autoscroll, ...config } = file.config;

    const screens = new Map<string, Screen>();
    for (const [id, screen] of Object.entries(file.screens)) {
        const content = screen.content.map((item, index): Element => {
            const element = typeof item === "string" ? { type: "text" as const, text: item } : item;
            return { ...element, id: `${id}#${index}` };
        });
        const { reveal, transition, effects, autoscroll, next } = screen;
        screens.set(id, { id, reveal, transition, effects, autoscroll, next, content });
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
            transition: transition ?? { type: "none" },
            teletype: { speed: defaults?.teletype?.speed ?? DEFAULT_TELETYPE_SPEED },
            glitch: { duration: defaults?.glitch?.duration ?? DEFAULT_GLITCH_DURATION },
        },
        effects,
        autoscroll: autoscroll ?? true,
        screens,
        dialogs,
    };
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

    const missing = (action: Action): string | null => {
        const known = action.type === "screen" ? program.screens : program.dialogs;
        return known.has(action.target) ? null : `Unknown ${action.type} "${action.target}"`;
    };

    for (const dialog of program.dialogs.values()) {
        for (const [answer, confirmed] of [
            ["confirm", true],
            ["cancel", false],
        ] as const) {
            const action = dialogAction(dialog, confirmed);
            const message = action && missing(action);
            if (message) {
                ctx.addIssue({
                    code: "custom",
                    path: ["dialogs", dialog.id, answer, "action"],
                    message,
                });
            }
        }
    }

    for (const screen of program.screens.values()) {
        screen.next?.forEach((rule, index) => {
            const message = missing(rule.action);
            if (message) {
                ctx.addIssue({
                    code: "custom",
                    path: ["screens", screen.id, "next", index, "action"],
                    message,
                });
            }
        });

        screen.content.forEach((element, index) => {
            for (const action of moduleFor(element).actions?.(element) ?? []) {
                const message = missing(action);
                if (message) {
                    ctx.addIssue({
                        code: "custom",
                        path: ["screens", screen.id, "content", index],
                        message,
                    });
                }
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
