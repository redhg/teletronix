import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ActionSchema, ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";
import { keyMatches, normalizeKey } from "../../engine/schema/next.ts";

export const ButtonSchema = z
    .strictObject({
        text: z.string().min(1).meta({ description: "The label, shown in brackets" }),
        action: ActionSchema.meta({ description: "What happens when it's pressed" }),
        secondaryAction: ActionSchema.optional().meta({
            description:
                "What happens on a secondary click: shift-click, right-click, Shift+Enter, or a " +
                "long press (default: the same as action)",
        }),
        key: z
            .string()
            .min(1)
            .transform(normalizeKey)
            .optional()
            .meta({
                description:
                    'A key that presses it from anywhere on the screen, e.g. "e" or "Enter". A ' +
                    "letter in the label is underlined.",
            }),
        className: z
            .string()
            .optional()
            .meta({ description: 'Space-separated CSS classes, e.g. "alert"' }),
    })
    .meta({ description: "A button in a row of buttons" });

export const ButtonsSchema = z
    .strictObject({
        type: z.literal("buttons"),
        buttons: z.array(ButtonSchema).min(1).meta({ description: "The buttons, left to right" }),
        gap: z
            .int()
            .min(0)
            .default(2)
            .meta({ description: "Columns of space between the buttons (default: 2)" }),
        align: ElementAlignSchema,
        ...ElementBaseShape,
    })
    .meta({
        description:
            "A row of buttons, drawn as [ LABEL ]: each only as wide as its label, pressed with a " +
            "click, <enter> or its hotkey. The arrow keys move between them.",
    });

export type ButtonsElement = z.output<typeof ButtonsSchema> & ElementIdentity;
export type Button = ButtonsElement["buttons"][number];

// no-break spaces inside the brackets, so a row only wraps between buttons
const NBSP = " ";

/** How a button is drawn: its label in brackets. */
export const buttonLabel = (button: Button) => `[${NBSP}${button.text}${NBSP}]`;

export const buttonsModule: ModuleDefinition<ButtonsElement> = {
    text: (element) => element.buttons.map(buttonLabel).join(" ".repeat(element.gap)),
    actions: (element) =>
        element.buttons.flatMap((button) =>
            button.secondaryAction ? [button.action, button.secondaryAction] : [button.action],
        ),
};

/** The button a key press would press, if any. */
export function buttonForKey(element: ButtonsElement, key: string): Button | undefined {
    return element.buttons.find((button) => button.key && keyMatches([button.key], key));
}

/** Where a button's hotkey letter is in its label, to underline it, or -1. */
export function hotkeyIndex(button: Button): number {
    const key = button.key;
    return key?.length === 1 ? button.text.toLowerCase().indexOf(key) : -1;
}
