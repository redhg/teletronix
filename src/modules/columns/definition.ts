import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";
import type { Element } from "../../engine/schema/elements.ts";
import type { RawContent } from "../section/definition.ts";

/**
 * The columns schema, given the schema for its contents (elements, which can hold columns),
 * built by the element registry to keep this module out of an import cycle with it.
 */
export const createColumnsSchema = (content: () => z.ZodType<RawContent[], RawContent[]>) =>
    z
        .strictObject({
            type: z.literal("columns"),
            count: z.int().min(1).default(2).meta({ description: "How many columns (default: 2)" }),
            minWidth: z
                .int()
                .min(1)
                .optional()
                .meta({
                    description:
                        "The narrowest a column can be, in characters: on a narrower screen, " +
                        "there are fewer columns",
                }),
            gap: z
                .int()
                .min(0)
                .default(2)
                .meta({ description: "Characters between the columns (default: 2)" }),
            order: z
                .enum(["down", "across"])
                .default("down")
                .meta({
                    description:
                        'How the elements fill the columns: "down" each column in turn, like a ' +
                        'directory listing, or "across" each row (default: "down")',
                }),
            content: z.lazy(content).meta({
                description: "The elements, revealed in order and laid out in the columns",
            }),
            ...ElementBaseShape,
        })
        .meta({
            description:
                "Lays elements out in columns on the character grid, e.g. a long list of links. " +
                "Each column wraps its text to its own width.",
        });

export type ColumnsElement = Omit<z.output<ReturnType<typeof createColumnsSchema>>, "content"> &
    ElementIdentity & { content: Element[] };

export const columnsModule: ModuleDefinition<ColumnsElement> = {
    // nothing of its own to show; its contents are shown in columns
    text: () => "",
};

/**
 * How many columns there's room for in `columns` characters (fewer than `count` when each
 * would be narrower than minWidth), and how wide each is.
 */
export function columnLayout(
    element: ColumnsElement,
    columns: number,
): { count: number; width: number } {
    const fit = element.minWidth
        ? Math.max(1, Math.floor((columns + element.gap) / (element.minWidth + element.gap)))
        : element.count;
    const count = Math.min(element.count, fit);
    const width = Math.max(1, Math.floor((columns - element.gap * (count - 1)) / count));
    return { count, width };
}
