import { z } from "zod";

// ─── Ids ─────────────────────────────────────────────────────────────────────

export const IdSchema = z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, "Ids may only contain letters, digits, '_' and '-'")
    .meta({ description: "A screen or dialog id (letters, digits, '_' and '-')" });

// ─── Reveals ─────────────────────────────────────────────────────────────────
// How an element's text appears on screen. Authors can use a bare name
// ("teletype") or an object with per-reveal options.

export const TeletypeOptionsSchema = z.strictObject({
    speed: z.number().positive().optional().meta({ description: "Milliseconds per character" }),
});

export const GlitchOptionsSchema = z.strictObject({
    duration: z.number().positive().optional().meta({ description: "Total time in milliseconds" }),
});

const TeletypeRevealSchema = TeletypeOptionsSchema.extend({ type: z.literal("teletype") });
const GlitchRevealSchema = GlitchOptionsSchema.extend({ type: z.literal("glitch") });
const InstantRevealSchema = z.strictObject({ type: z.literal("instant") });

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

const GlitchTransitionSchema = GlitchOptionsSchema.extend({ type: z.literal("glitch") });
const CutTransitionSchema = z.strictObject({ type: z.literal("cut") });
const FadeTransitionSchema = z.strictObject({
    type: z.literal("fade"),
    duration: z.number().positive().optional().meta({ description: "Milliseconds (default: 600)" }),
});

export const TransitionSchema = z
    .union([
        z.enum(["cut", "glitch", "fade"]),
        z.discriminatedUnion("type", [
            CutTransitionSchema,
            GlitchTransitionSchema,
            FadeTransitionSchema,
        ]),
    ])
    .transform(
        (transition): TransitionOption =>
            typeof transition === "string" ? { type: transition } : transition,
    )
    .meta({
        description:
            'How the previous screen leaves: "cut" (it disappears), "glitch" (it erases ' +
            'itself over this screen while this screen reveals) or "fade" (it fades out like ' +
            "phosphor afterglow)",
    });

/** A transition as written by an author, normalized to object form. Options are partial. */
export type TransitionOption =
    | { type: "cut" }
    | { type: "glitch"; duration?: number }
    | { type: "fade"; duration?: number };

// ─── Actions ─────────────────────────────────────────────────────────────────
// What an interactive element does. Shared by links, prompts and dialogs.

const ScreenActionSchema = z
    .strictObject({ screen: IdSchema })
    .meta({ description: "Navigate to a screen" });
const DialogActionSchema = z
    .strictObject({ dialog: IdSchema })
    .meta({ description: "Open a dialog" });

export const ActionSchema = z
    .union([ScreenActionSchema, DialogActionSchema])
    .transform(
        (action): Action =>
            "screen" in action
                ? { type: "screen", target: action.screen }
                : { type: "dialog", target: action.dialog },
    );

export type Action = { type: "screen"; target: string } | { type: "dialog"; target: string };

// ─── Element base ────────────────────────────────────────────────────────────

export const ElementBaseShape = {
    className: z
        .string()
        .optional()
        .meta({ description: 'Space-separated CSS classes, e.g. "alert"' }),
    reveal: RevealSchema.optional(),
};
