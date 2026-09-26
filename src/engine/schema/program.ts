import { z } from "zod";
import {
    type Action,
    ActionSchema,
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

export type { Dialog } from "./dialog.ts";

export const DEFAULT_TELETYPE_SPEED = 10;
export const DEFAULT_GLITCH_DURATION = 1000;

// ─── Authoring schema (what a JSON file contains) ────────────────────────────

const ContentSchema = z.union([
    z.string().meta({ description: "Shorthand for a text element" }),
    ElementSchema,
]);

const NextSchema = z
    .strictObject({
        after: z
            .number()
            .min(0)
            .optional()
            .meta({ description: "Milliseconds to wait after the screen has finished revealing" }),
        anyKey: z
            .boolean()
            .optional()
            .meta({ description: "Also go on at any click or key press (default: false)" }),
        action: ActionSchema.meta({ description: "Where to go" }),
    })
    .refine((next) => next.after !== undefined || next.anyKey, {
        message: 'Set "after", "anyKey", or both',
    })
    .meta({
        description:
            "Moves on without a link: after a delay, at any key, or both. With empty content and " +
            '"static" at full opacity, this makes a burst of noise between screens.',
    });

const ScreenSchema = z.strictObject({
    reveal: RevealSchema.optional().meta({
        description: "Default reveal for this screen's elements",
    }),
    transition: TransitionSchema.optional().meta({
        description: "How the previous screen leaves when this one is shown",
    }),
    effects: EffectsSchema.optional().meta({
        description: "Effects for this screen, layered over the config's",
    }),
    next: NextSchema.optional(),
    content: z
        .array(ContentSchema)
        .meta({ description: "The elements, revealed in order. Can be empty." }),
});

const DefaultsSchema = z.strictObject({
    reveal: RevealSchema.optional().meta({ description: 'Default reveal (default: "teletype")' }),
    teletype: TeletypeOptionsSchema.optional().meta({
        description: "Default teletype options",
    }),
    glitch: GlitchOptionsSchema.optional().meta({
        description: "Default glitch options, for reveals and transitions",
    }),
    transition: TransitionSchema.optional().meta({
        description: 'Default screen transition (default: "cut")',
    }),
});

const ConfigSchema = z.strictObject({
    name: z.string(),
    author: z.string().optional(),
    description: z.string().optional(),
    start: IdSchema.optional().meta({ description: "The first screen (default: the first one)" }),
    defaults: DefaultsSchema.optional(),
    effects: EffectsSchema.optional(),
});

/** The shape of a Teletronix JSON file, before normalization. Used to generate the JSON Schema. */
export const FileSchema = z
    .strictObject({
        $schema: z.string().optional(),
        config: ConfigSchema,
        screens: z.record(IdSchema, ScreenSchema),
        dialogs: z.record(IdSchema, DialogSchema).optional(),
    })
    .meta({ title: "Teletronix program" });

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
    next?: { after?: number; anyKey?: boolean; action: Action };
    content: Element[];
}

export interface Program {
    config: { name: string; author?: string; description?: string };
    start: string;
    defaults: Defaults;
    effects?: EffectsSetting;
    screens: ReadonlyMap<string, Screen>;
    dialogs: ReadonlyMap<string, Dialog>;
}

function normalize(file: z.output<typeof FileSchema>): Program {
    const { start, defaults, effects, ...config } = file.config;

    const screens = new Map<string, Screen>();
    for (const [id, screen] of Object.entries(file.screens)) {
        const content = screen.content.map((item, index): Element => {
            const element = typeof item === "string" ? { type: "text" as const, text: item } : item;
            return { ...element, id: `${id}#${index}` };
        });
        const { reveal, transition, effects, next } = screen;
        screens.set(id, { id, reveal, transition, effects, next, content });
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
            reveal: defaults?.reveal ?? { type: "teletype" },
            transition: defaults?.transition ?? { type: "cut" },
            teletype: { speed: defaults?.teletype?.speed ?? DEFAULT_TELETYPE_SPEED },
            glitch: { duration: defaults?.glitch?.duration ?? DEFAULT_GLITCH_DURATION },
        },
        effects,
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
        const message = screen.next && missing(screen.next.action);
        if (message) {
            ctx.addIssue({
                code: "custom",
                path: ["screens", screen.id, "next", "action"],
                message,
            });
        }

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
        errors: result.error.issues.map((issue) => ({
            path: formatPath(issue.path),
            message: issue.message,
        })),
    };
}

function formatPath(path: readonly PropertyKey[]): string {
    return path.reduce<string>((out, key) => {
        if (typeof key === "number") return `${out}[${key}]`;
        const name = String(key);
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) return `${out}[${JSON.stringify(name)}]`;
        return out ? `${out}.${name}` : name;
    }, "");
}
