import { z } from "zod";
import { type Action, ActionSchema } from "./common.ts";

const ContentSchema = z
    .union([z.string(), z.array(z.string()).min(1)])
    .transform((content) => (typeof content === "string" ? [content] : content))
    .meta({ description: "The dialog's text: a string, or an array of paragraphs" });

const className = z.string().optional().meta({ description: "Space-separated CSS classes" });

export const AlertSchema = z
    .strictObject({
        type: z.literal("alert"),
        content: ContentSchema,
        dismiss: z
            .string()
            .min(1)
            .default("OK")
            .meta({ description: 'The button that closes it (default: "OK")' }),
        className,
    })
    .meta({ description: "A message. Closes with <enter>, <esc>, or a click." });

export const ConfirmButtonSchema = z
    .strictObject({
        text: z.string().min(1).default("YES").meta({ description: 'The label (default: "YES")' }),
        action: ActionSchema.meta({ description: "What happens when it's chosen" }),
    })
    .meta({ description: 'The "yes" button, chosen with <enter>' });

export const CancelButtonSchema = z
    .strictObject({
        text: z.string().min(1).default("NO").meta({ description: 'The label (default: "NO")' }),
        action: ActionSchema.optional().meta({
            description: "What happens when it's chosen (default: nothing; the dialog closes)",
        }),
    })
    .meta({ description: 'The "no" button, chosen with <esc> or a click outside the dialog' });

export const ConfirmSchema = z
    .strictObject({
        type: z.literal("confirm"),
        content: ContentSchema,
        confirm: ConfirmButtonSchema,
        cancel: CancelButtonSchema.default({ text: "NO" }),
        className,
    })
    .meta({ description: "A yes/no question. Each answer can trigger an action." });

export const DialogSchema = z.discriminatedUnion("type", [AlertSchema, ConfirmSchema]);

export type Dialog = z.output<typeof DialogSchema> & { id: string };

/** The action an answer triggers, if any. Alerts only close. */
export function dialogAction(dialog: Dialog, confirmed: boolean): Action | undefined {
    if (dialog.type === "alert") return undefined;
    return confirmed ? dialog.confirm.action : dialog.cancel.action;
}
