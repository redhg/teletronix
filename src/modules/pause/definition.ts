import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";

export const PauseSchema = z
    .strictObject({
        type: z.literal("pause"),
        text: z
            .string()
            .optional()
            .meta({
                description:
                    'What it shows while waiting (default: "-- PRESS ANY KEY TO CONTINUE --", or ' +
                    '"[ CONTINUE ]" for a button)',
            }),
        button: z
            .boolean()
            .default(false)
            .meta({
                description:
                    "Make it a button: only clicking it, or Enter or Space while it has the " +
                    "keyboard, carries on, not any key or a tap anywhere. It takes the keyboard " +
                    "when it appears (default: false)",
            }),
        align: ElementAlignSchema,
        ...ElementBaseShape,
    })
    .meta({
        description:
            "Stops the screen's reveal and shows a line of text until the player presses a key " +
            "or taps (or, as a button, clicks it); then the line goes and the reveal carries on. " +
            "Skipping stops at it too.",
    });

export type PauseElement = z.output<typeof PauseSchema> & ElementIdentity;

/** What a pause shows: its own text, or the default for its kind. */
export const pauseText = (element: PauseElement) =>
    element.text ?? (element.button ? "[ CONTINUE ]" : "-- PRESS ANY KEY TO CONTINUE --");

export const pauseModule: ModuleDefinition<PauseElement> = {
    text: pauseText,
};
