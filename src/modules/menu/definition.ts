import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ActionSchema, ElementBaseShape } from "../../engine/schema/common.ts";
import { normalizeKey } from "../../engine/schema/next.ts";

export const MenuItemSchema = z
    .strictObject({
        text: z.string().min(1).meta({ description: "The item's text" }),
        action: ActionSchema.meta({ description: "What happens when it's chosen" }),
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
            .meta({ description: 'A key that chooses it from anywhere on the screen, e.g. "1"' }),
        className: z
            .string()
            .optional()
            .meta({ description: 'Space-separated CSS classes, e.g. "alert"' }),
    })
    .meta({ description: "An item in a menu" });

export const MenuSchema = z
    .strictObject({
        type: z.literal("menu"),
        items: z.array(MenuItemSchema).min(1).meta({ description: "The items, top to bottom" }),
        marker: z
            .string()
            .default(">")
            .meta({ description: 'Shown before the highlighted item (default: ">")' }),
        ...ElementBaseShape,
    })
    .meta({
        description:
            "A list of choices, like a BIOS or DOS menu: the highlighted item is marked, " +
            "<up> and <down> move the highlight, and <enter> (or a click) chooses it. It " +
            "remembers which item was highlighted.",
    });

export type MenuElement = z.output<typeof MenuSchema> & ElementIdentity;
export type MenuItem = MenuElement["items"][number];

/** The space the marker takes before every item, highlighted or not. */
export const markerSpace = (menu: MenuElement) => " ".repeat(menu.marker.length + 1);

/** A menu's memory is the highlighted item's index. */
export const menuModule: ModuleDefinition<MenuElement, number> = {
    text: (menu) => menu.items.map((item) => markerSpace(menu) + item.text).join("\n"),
    actions: (menu) =>
        menu.items.flatMap((item) =>
            item.secondaryAction ? [item.action, item.secondaryAction] : [item.action],
        ),
    hotkeys: (menu) =>
        menu.items.flatMap((item) => (item.key ? [{ key: item.key, action: item.action }] : [])),
};

/** The highlighted item, kept in range. */
export const highlighted = (menu: MenuElement, memory: number | undefined) =>
    Math.min(Math.max(memory ?? 0, 0), menu.items.length - 1);
