import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { type Action, ActionSchema, ElementBaseShape } from "../../engine/schema/common.ts";
import { VariableNameSchema } from "../../engine/schema/variables.ts";

export const NumberRuleSchema = z
    .strictObject({
        equals: z.int().optional().meta({ description: "Exactly this number" }),
        atLeast: z.number().optional().meta({ description: "This number or more" }),
        atMost: z.number().optional().meta({ description: "This number or less" }),
        action: ActionSchema.meta({ description: "What happens" }),
    })
    .refine(
        (rule) =>
            rule.equals !== undefined || rule.atLeast !== undefined || rule.atMost !== undefined,
        { message: 'Set "equals", "atLeast" or "atMost" (or a combination)' },
    )
    .meta({
        description:
            "An action for numbers in a range. Set more than one condition and the number must " +
            "meet them all.",
    });

export type NumberRule = z.output<typeof NumberRuleSchema>;

export const NumberSchema = z
    .strictObject({
        type: z.literal("number"),
        prompt: z
            .string()
            .default("> ")
            .meta({ description: 'Text shown before the input (default: "> ")' }),
        digits: z
            .int()
            .min(1)
            .max(15)
            .optional()
            .meta({ description: "The most digits it takes, e.g. 4 for a PIN" }),
        min: z.int().optional().meta({ description: "The lowest number it accepts" }),
        max: z.int().optional().meta({ description: "The highest number it accepts" }),
        mask: z
            .boolean()
            .default(false)
            .meta({ description: "Show * for each digit, for codes and PINs (default: false)" }),
        on: z.array(NumberRuleSchema).optional().meta({
            description: "Actions for numbers in ranges. The first rule the number meets runs.",
        }),
        otherwise: ActionSchema.optional().meta({
            description: "What happens when the number meets none of the rules",
        }),
        variable: VariableNameSchema.optional().meta({
            description: "A number variable that gets the number entered, before any action",
        }),
        unknown: z
            .string()
            .default("Invalid entry.")
            .meta({
                description:
                    "Shown when the number is outside min and max, or meets no rule and there's " +
                    'no "otherwise" (default: "Invalid entry.")',
            }),
        ...ElementBaseShape,
    })
    .refine((element) => element.on !== undefined || element.otherwise !== undefined, {
        message: 'Give it "on" rules, "otherwise", or both',
    })
    .meta({
        description:
            "A prompt that only takes whole numbers: a keypad, a door code, a fuel setting. On " +
            "<enter>, the first rule the number meets runs, or else otherwise.",
    });

export type NumberElement = z.output<typeof NumberSchema> & ElementIdentity;

const meets = (rule: NumberRule, value: number) =>
    (rule.equals === undefined || value === rule.equals) &&
    (rule.atLeast === undefined || value >= rule.atLeast) &&
    (rule.atMost === undefined || value <= rule.atMost);

/** Whether a number is one the element accepts: within its min and max. */
export function inRange(element: NumberElement, value: number): boolean {
    return (
        (element.min === undefined || value >= element.min) &&
        (element.max === undefined || value <= element.max)
    );
}

/** The action for a number entered: the first rule it meets, or else otherwise. */
export function numberAction(element: NumberElement, value: number): Action | null {
    if (!inRange(element, value)) return null;
    return (
        (element.on ?? []).find((rule) => meets(rule, value))?.action ?? element.otherwise ?? null
    );
}

/** What's typed, as the digits the element takes. */
export const onlyDigits = (element: NumberElement, typed: string) =>
    typed.replace(/\D/g, "").slice(0, element.digits ?? 15);

export const numberModule: ModuleDefinition<NumberElement, number> = {
    text: (element) => element.prompt,
    actions: (element) => [
        ...(element.on ?? []).map((rule) => rule.action),
        ...(element.otherwise ? [element.otherwise] : []),
    ],
    binding: {
        check: (_element, initial) =>
            typeof initial === "number" ? null : "A number can only be bound to a number variable",
        read: (_element, value) => Number(value),
        write: (_element, memory) => memory,
    },
};
