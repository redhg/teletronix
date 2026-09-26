import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { type Action, ActionSchema, ElementBaseShape } from "../../engine/schema/common.ts";

export const LinkSchema = z
    .strictObject({
        type: z.literal("link"),
        text: z.string().min(1).meta({ description: "The link's text" }),
        action: ActionSchema.meta({ description: "What happens when the link is clicked" }),
        secondaryAction: ActionSchema.optional().meta({
            description:
                "What happens on a secondary click: shift-click, right-click, Shift+Enter, or a " +
                "long press on touch screens (default: the same as action)",
        }),
        ...ElementBaseShape,
    })
    .meta({ description: "Clickable text that navigates to a screen or opens a dialog" });

export type LinkElement = z.output<typeof LinkSchema> & ElementIdentity;

export const linkModule: ModuleDefinition<LinkElement> = {
    text: (element) => element.text,
    actions: (element) =>
        element.secondaryAction ? [element.action, element.secondaryAction] : [element.action],
};

/**
 * The action a link triggers. The secondary action (shift-click, right-click, Shift+Enter
 * or a long press) falls back to the main one when the link doesn't have one.
 */
export function linkAction(element: LinkElement, secondary: boolean): Action {
    return secondary && element.secondaryAction ? element.secondaryAction : element.action;
}
