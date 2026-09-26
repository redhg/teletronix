import { z } from "zod";

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

// ─── Actions ─────────────────────────────────────────────────────────────────
// What an interactive element does. Shared by links, prompts and dialogs.

export const ScreenActionSchema = z
    .strictObject({ screen: IdSchema })
    .meta({ description: "Navigate to a screen" });
export const DialogActionSchema = z
    .strictObject({ dialog: IdSchema })
    .meta({ description: "Open a dialog" });

export const ActionSchema = z
    .union([ScreenActionSchema, DialogActionSchema])
    .transform(
        (action): Action =>
            "screen" in action
                ? { type: "screen", target: action.screen }
                : { type: "dialog", target: action.dialog },
    )
    .meta({ description: "What an interactive element does: go to a screen, or open a dialog" });

export type Action = { type: "screen"; target: string } | { type: "dialog"; target: string };

// ─── Element base ────────────────────────────────────────────────────────────

export const ElementBaseShape = {
    className: z
        .string()
        .optional()
        .meta({ description: 'Space-separated CSS classes, e.g. "alert"' }),
    reveal: RevealSchema.optional().meta({
        description: "How this element's text appears (default: the screen's reveal)",
    }),
};
