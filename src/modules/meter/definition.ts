import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";
import { VariableNameSchema } from "../../engine/schema/variables.ts";
import { createBarReveal, sliderLine } from "../slider/definition.ts";

export const MeterRangeSchema = z
    .strictObject({
        atLeast: z.number().optional().meta({ description: "This value or more" }),
        atMost: z.number().optional().meta({ description: "This value or less" }),
        equals: z.number().optional().meta({ description: "Exactly this value" }),
        className: z.string().min(1).meta({
            description:
                'Space-separated CSS classes the meter has while its value is in the range, e.g. "alert"',
        }),
    })
    .refine(
        (rule) =>
            rule.atLeast !== undefined || rule.atMost !== undefined || rule.equals !== undefined,
        { message: 'Set "atLeast", "atMost" or "equals" (or a combination)' },
    )
    .meta({ description: "Classes for a range of values, e.g. red when it's low" });

export type MeterRange = z.output<typeof MeterRangeSchema>;

export const MeterSchema = z
    .strictObject({
        type: z.literal("meter"),
        variable: VariableNameSchema.meta({
            description: "The number variable, or timer (in seconds), it shows",
        }),
        label: z.string().optional().meta({ description: "Text before the bar" }),
        min: z.number().default(0).meta({ description: "The value of an empty bar (default: 0)" }),
        max: z
            .number()
            .default(100)
            .meta({ description: "The value of a full bar (default: 100)" }),
        step: z
            .number()
            .positive()
            .default(1)
            .meta({ description: "How precisely the value is shown, e.g. 0.1 (default: 1)" }),
        unit: z
            .string()
            .default("")
            .meta({ description: 'Shown after the value, e.g. "%" or " L"' }),
        showValue: z
            .boolean()
            .default(true)
            .meta({ description: "Show the value after the bar (default: true)" }),
        width: z
            .int()
            .min(1)
            .optional()
            .meta({ description: "Bar width in characters (default: the rest of the line)" }),
        fill: z
            .string()
            .length(1)
            .default("█")
            .meta({ description: 'Filled cells (default: "█")' }),
        empty: z
            .string()
            .length(1)
            .default("░")
            .meta({ description: 'Empty cells (default: "░")' }),
        on: z.array(MeterRangeSchema).optional().meta({
            description: "Classes for ranges of values; every range the value is in adds its own",
        }),
        ...ElementBaseShape,
    })
    .refine((meter) => meter.max > meter.min, {
        path: ["max"],
        message: "max must be greater than min",
    })
    .meta({
        description:
            "A gauge: a bar showing a number variable or a timer, which moves whenever it " +
            "changes, e.g. oxygen running out. It can't be changed by the player (a slider can).",
    });

export type MeterElement = z.output<typeof MeterSchema> & ElementIdentity;

/** The value to draw, rounded to the meter's step. */
export function meterValue(meter: MeterElement, value: unknown): number {
    const number = typeof value === "number" ? value : meter.min;
    return Math.round(number / meter.step) * meter.step;
}

const inRange = (rule: MeterRange, value: number) =>
    (rule.atLeast === undefined || value >= rule.atLeast) &&
    (rule.atMost === undefined || value <= rule.atMost) &&
    (rule.equals === undefined || value === rule.equals);

/** The classes a meter has at `value`, from the ranges it's in. */
export function meterClasses(meter: MeterElement, value: number): string[] {
    return (meter.on ?? []).flatMap((rule) => (inRange(rule, value) ? [rule.className] : []));
}

/** A meter's memory is its variable's (or timer's) value. */
export const meterModule: ModuleDefinition<MeterElement, number> = {
    text: (meter, memory) => sliderLine(meter, meterValue(meter, memory), 80),
    source: (meter) => meter.variable,
    reveal: (meter, spec, context) =>
        createBarReveal(meter, spec, context, () => meterValue(meter, context.memory())),
};
