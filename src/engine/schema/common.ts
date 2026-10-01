import { z } from "zod";
import { AssignmentsSchema, ConditionSchema, VariableNameSchema } from "./variables.ts";

// ─── Ids ─────────────────────────────────────────────────────────────────────

export const IdSchema = z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, "Ids may only contain letters, digits, '_' and '-'")
    .meta({ description: "A screen or dialog id (letters, digits, '_' and '-')" });

// ─── Reveals ─────────────────────────────────────────────────────────────────
// How an element's text appears on screen. Authors can use a bare name
// ("teletype") or an object with per-reveal options.

export const TeletypeOptionsSchema = z
    .strictObject({
        speed: z
            .number()
            .positive()
            .optional()
            .meta({ description: "Milliseconds per character (default: 10)" }),
    })
    .meta({ description: "Default options for teletype reveals" });

export const GlitchOptionsSchema = z
    .strictObject({
        duration: z
            .number()
            .positive()
            .optional()
            .meta({ description: "Milliseconds a glitch takes (default: 1000)" }),
    })
    .meta({ description: "Default options for glitch reveals and transitions" });

export const TeletypeRevealSchema = TeletypeOptionsSchema.extend({
    type: z.literal("teletype"),
}).meta({ description: "Types the text one character at a time" });
export const GlitchRevealSchema = z
    .strictObject({
        type: z.literal("glitch"),
        duration: z.number().positive().optional().meta({
            description: "Milliseconds for the text to resolve (default: config.defaults.glitch)",
        }),
    })
    .meta({ description: "Resolves the text out of random glyphs, left to right" });
export const InstantRevealSchema = z
    .strictObject({ type: z.literal("instant") })
    .meta({ description: "Shows the text all at once" });

const RevealObjectSchema = z.discriminatedUnion("type", [
    TeletypeRevealSchema,
    GlitchRevealSchema,
    InstantRevealSchema,
]);

export const RevealSchema = z
    .union([z.enum(["teletype", "glitch", "instant"]), RevealObjectSchema])
    .transform((reveal) => (typeof reveal === "string" ? { type: reveal } : reveal))
    .meta({
        description:
            'How text appears: "teletype" (character by character), "glitch" (resolves out of ' +
            'random glyphs) or "instant" (all at once). Use an object to override options, e.g. ' +
            '{ "type": "teletype", "speed": 20 }. When a screen or the config sets "glitch", ' +
            "consecutive elements that don't set their own reveal glitch in together as one block.",
    });

/** A reveal as written by an author, normalized to object form. Options are partial. */
export type RevealOption = z.output<typeof RevealSchema>;

// ─── Transitions ─────────────────────────────────────────────────────────────
// How the previous screen leaves when a screen is shown.

export const GlitchTransitionSchema = z
    .strictObject({
        type: z.literal("glitch"),
        duration: z.number().positive().optional().meta({
            description:
                "Milliseconds for the old screen to erase (default: config.defaults.glitch)",
        }),
    })
    .meta({ description: "The old screen erases itself over the new one as it appears" });
export const NoneTransitionSchema = z
    .strictObject({ type: z.literal("none") })
    .meta({ description: "The old screen disappears at once" });
export const StaticTransitionSchema = z
    .strictObject({
        type: z.literal("static"),
        duration: z
            .number()
            .positive()
            .optional()
            .meta({ description: "Milliseconds of static (default: 120)" }),
    })
    .meta({
        description:
            "A brief burst of full-screen noise, like changing channels, before the new screen",
    });
export const FadeTransitionSchema = z
    .strictObject({
        type: z.literal("fade"),
        duration: z
            .number()
            .positive()
            .optional()
            .meta({ description: "Milliseconds to fade out (default: 600)" }),
    })
    .meta({ description: "The old screen fades out behind the new one, like phosphor afterglow" });

export const TransitionSchema = z
    .union([
        z.enum(["none", "glitch", "fade", "static"]),
        z.discriminatedUnion("type", [
            NoneTransitionSchema,
            GlitchTransitionSchema,
            FadeTransitionSchema,
            StaticTransitionSchema,
        ]),
    ])
    .transform(
        (transition): TransitionOption =>
            typeof transition === "string" ? { type: transition } : transition,
    )
    .meta({
        description:
            'How the previous screen leaves: "none" (it disappears at once), "glitch" (it erases ' +
            'itself over this screen while this screen reveals), "fade" (it fades out like ' +
            'phosphor afterglow) or "static" (a brief burst of full-screen noise, like changing ' +
            "channels, before this screen reveals)",
    });

/** A transition as written by an author, normalized to object form. Options are partial. */
export type TransitionOption =
    | { type: "none" }
    | { type: "glitch"; duration?: number }
    | { type: "fade"; duration?: number }
    | { type: "static"; duration?: number };

// ─── Alignment ───────────────────────────────────────────────────────────────

export const AlignSchema = z.enum(["left", "center", "right"]).meta({
    description:
        'Where the text sits across the screen: "left", "center" or "right". Centered and ' +
        "right-aligned text moves as one block, so its lines keep their shape (e.g. ASCII art): " +
        "the widest line decides where every line starts.",
});

/** An element's `align`. */
export const ElementAlignSchema = AlignSchema.optional().meta({
    description:
        'Where the text sits across the screen: "left", "center" or "right". Centered and ' +
        "right-aligned text moves as one block, so its lines keep their shape (e.g. ASCII " +
        'art): the widest line decides where every line starts (default: the screen\'s, or "left")',
});

// ─── Actions ─────────────────────────────────────────────────────────────────
// What an interactive element does. Shared by links, prompts and dialogs.

/** A sound from the program's `sounds`, by name. */
export const SoundNameSchema = IdSchema.meta({
    description: "The name of a sound in the program's sounds",
});

const actionSound = SoundNameSchema.optional().meta({
    description: "A sound from the program's sounds, played as the action happens",
});

export const ActionCaseSchema = z
    .strictObject({
        if: ConditionSchema.optional().meta({
            description: "Only when this holds; otherwise the next case in the list is tried",
        }),
        screen: IdSchema.optional().meta({ description: "A screen to go to" }),
        dialog: IdSchema.optional().meta({ description: "A dialog to open" }),
        set: AssignmentsSchema.optional().meta({
            description: 'Variables to change first, e.g. { "keycard": true }',
        }),
        startTimer: VariableNameSchema.optional().meta({
            description: "A timer to start (or carry on, if it was stopped partway)",
        }),
        stopTimer: VariableNameSchema.optional().meta({
            description: "A timer to stop where it is",
        }),
        resetTimer: VariableNameSchema.optional().meta({
            description: "A timer to stop and put back to its start",
        }),
        sound: actionSound,
        restart: z
            .literal(true)
            .optional()
            .meta({
                description:
                    "Start the program over, as if just loaded: the start screen, with every " +
                    "variable, timer and element's memory (e.g. a locked login) back where it began",
            }),
    })
    .refine((action) => !(action.screen && action.dialog), {
        message: 'Set "screen" or "dialog", not both',
    })
    .refine((action) => !(action.restart && (action.screen || action.dialog || action.set)), {
        message:
            'A restart goes to the start screen afresh: leave out "screen", "dialog" and "set"',
    })
    .refine(
        (action) =>
            action.screen !== undefined ||
            action.dialog !== undefined ||
            action.restart !== undefined ||
            action.set !== undefined ||
            action.sound !== undefined ||
            action.startTimer !== undefined ||
            action.stopTimer !== undefined ||
            action.resetTimer !== undefined,
        {
            message:
                'Set "screen", "dialog", "set", "sound", "restart" or a timer to start, stop or reset',
        },
    )
    .meta({
        description:
            "Go to a screen or open a dialog, changing variables and playing a sound on the way",
    });

export const ActionSchema = z
    .union([ActionCaseSchema, z.array(ActionCaseSchema).min(1)])
    .transform((action): Action => (Array.isArray(action) ? action : [action]))
    .meta({
        description:
            "What happens: go to a screen, open a dialog, change variables, play a sound. Or a " +
            'list of these with "if" conditions, where the first whose condition holds happens.',
    });

/** One case of an action, normalized. */
export type ActionCase = z.output<typeof ActionCaseSchema>;

/** An action: cases, of which the first whose condition holds happens. */
export type Action = readonly ActionCase[];

// ─── Element base ────────────────────────────────────────────────────────────

export const ElementBaseShape = {
    className: z
        .string()
        .optional()
        .meta({ description: 'Space-separated CSS classes, e.g. "alert"' }),
    reveal: RevealSchema.optional().meta({
        description: "How this element's text appears (default: the screen's reveal)",
    }),
    sound: SoundNameSchema.optional().meta({
        description: "A sound from the program's sounds, played as the element starts to appear",
    }),
    if: ConditionSchema.optional().meta({
        description: "Show the element only if this holds when the screen starts",
    }),
};
