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

const TeletypeRevealSchema = TeletypeOptionsSchema.extend({ type: z.literal("teletype") });
const NoneRevealSchema = z.strictObject({ type: z.literal("none") });

const RevealObjectSchema = z.discriminatedUnion("type", [TeletypeRevealSchema, NoneRevealSchema]);

export const RevealNameSchema = z.enum(["teletype", "none"]);
export type RevealName = z.infer<typeof RevealNameSchema>;

export const RevealSchema = z
    .union([RevealNameSchema, RevealObjectSchema])
    .transform((reveal) => (typeof reveal === "string" ? { type: reveal } : reveal))
    .meta({
        description:
            'How text appears: "teletype" (character by character) or "none" (instantly). ' +
            'Use an object to override options, e.g. { "type": "teletype", "speed": 20 }',
    });

/** A reveal as written by an author, normalized to object form. Options are partial. */
export type RevealOption = z.output<typeof RevealSchema>;

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
