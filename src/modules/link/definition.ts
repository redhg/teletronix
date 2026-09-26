import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { type Action, ActionSchema, ElementBaseShape } from "../../engine/schema/common.ts";

export const LinkSchema = z
    .strictObject({
        type: z.literal("link"),
        text: z.string().min(1).meta({ description: "The link's text" }),
        action: ActionSchema.meta({ description: "What happens when the link is clicked" }),
        shiftAction: ActionSchema.optional().meta({
            description: "What happens when the link is shift-clicked (defaults to action)",
        }),
        ...ElementBaseShape,
    })
    .meta({ description: "Clickable text that navigates to a screen or opens a dialog" });

export type LinkElement = z.output<typeof LinkSchema> & ElementIdentity;

export const linkModule: ModuleDefinition<LinkElement> = {
    text: (element) => element.text,
    actions: (element) =>
        element.shiftAction ? [element.action, element.shiftAction] : [element.action],
};

/** The action a click triggers, honoring the shift-click variant. */
export function linkAction(element: LinkElement, modifiers: { shiftKey: boolean }): Action {
    return modifiers.shiftKey && element.shiftAction ? element.shiftAction : element.action;
}
