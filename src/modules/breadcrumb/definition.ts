import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { createTimedReveal } from "../../engine/reveal/index.ts";
import { ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";

export const BreadcrumbSchema = z
    .strictObject({
        type: z.literal("breadcrumb"),
        separator: z.string().default(" › ").meta({
            description: 'What goes between the steps (default: " › ")',
        }),
        align: ElementAlignSchema,
        ...ElementBaseShape,
    })
    .meta({
        description:
            "Where the player is, following screens' parents (see a screen's \"parent\" and " +
            '"title"): HOME › READOUTS › SPINNERS, each step a link back but the last. It appears ' +
            "at once.",
    });

export type BreadcrumbElement = z.output<typeof BreadcrumbSchema> & ElementIdentity;

export const breadcrumbModule: ModuleDefinition<BreadcrumbElement> = {
    text: () => "",
    reveal: () => createTimedReveal(0),
};
