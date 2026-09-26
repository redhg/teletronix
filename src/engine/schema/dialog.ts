import { z } from "zod";
import { type Action, ActionSchema } from "./common.ts";

const ContentSchema = z
    .union([z.string(), z.array(z.string()).min(1)])
    .transform((content) => (typeof content === "string" ? [content] : content))
    .meta({ description: "The dialog's text: a string, or an array of paragraphs" });

const className = z.string().optional().meta({ description: "Space-separated CSS classes" });

const AlertSchema = z
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

const ConfirmSchema = z
    .strictObject({
        type: z.literal("confirm"),
        content: ContentSchema,
        confirm: z
            .strictObject({
                text: z.string().min(1).default("YES"),
                action: ActionSchema,
            })
            .meta({ description: 'The "yes" button (<enter>) and what it does' }),
        cancel: z
            .strictObject({
                text: z.string().min(1).default("NO"),
                action: ActionSchema.optional(),
            })
            .default({ text: "NO" })
            .meta({
                description:
                    'The "no" button (<esc>, or a click outside) and what it does, if anything',
            }),
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
