import { z } from "zod";
import type { ElementIdentity, ModuleDefinition, RevealContext } from "../../engine/module.ts";
import {
    createReveal,
    type Frame,
    type Reveal,
    type RevealSpec,
} from "../../engine/reveal/index.ts";
import { type Action, ActionSchema, ElementBaseShape } from "../../engine/schema/common.ts";

export const SliderRuleSchema = z
    .strictObject({
        atLeast: z
            .number()
            .optional()
            .meta({ description: "Fires when the value rises to this or above" }),
        atMost: z
            .number()
            .optional()
            .meta({ description: "Fires when the value falls to this or below" }),
        equals: z
            .number()
            .optional()
            .meta({ description: "Fires when the value lands on exactly this" }),
        action: ActionSchema.meta({ description: "What happens" }),
    })
    .refine(
        (rule) =>
            rule.atLeast !== undefined || rule.atMost !== undefined || rule.equals !== undefined,
        { message: 'Set "atLeast", "atMost" or "equals" (or a combination)' },
    )
    .meta({
        description:
            "An action for a range of values. It fires each time the value moves into the range; " +
            "set more than one condition and the value must meet them all.",
    });

export type SliderRule = z.output<typeof SliderRuleSchema>;

export const SliderSchema = z
    .strictObject({
        type: z.literal("slider"),
        label: z.string().optional().meta({ description: "Text before the bar" }),
        min: z.number().default(0).meta({ description: "The lowest value (default: 0)" }),
        max: z.number().default(100).meta({ description: "The highest value (default: 100)" }),
        step: z
            .number()
            .positive()
            .default(1)
            .meta({ description: "The smallest change, e.g. 5, or 0.1 (default: 1)" }),
        value: z.number().optional().meta({ description: "Where it starts (default: min)" }),
        unit: z
            .string()
            .default("")
            .meta({ description: 'Shown after the value, e.g. "%" or " MHz"' }),
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
        on: z.array(SliderRuleSchema).optional().meta({
            description: "Actions for ranges of values. The first rule the value moves into fires.",
        }),
        onEnter: ActionSchema.optional().meta({
            description: "What happens when the player presses <enter> on the slider",
        }),
        ...ElementBaseShape,
    })
    .superRefine((slider, ctx) => {
        if (slider.max <= slider.min) {
            ctx.addIssue({
                code: "custom",
                path: ["max"],
                message: "max must be greater than min",
            });
        }
        const { value } = slider;
        if (value !== undefined && (value < slider.min || value > slider.max)) {
            ctx.addIssue({
                code: "custom",
                path: ["value"],
                message: "value must be between min and max",
            });
        }
    })
    .meta({
        description:
            "A bar the player sets by dragging, or with the arrow keys. It remembers its value, " +
            "and can run actions when the value enters a range.",
    });

export type SliderElement = z.output<typeof SliderSchema> & ElementIdentity;

/** A slider's memory is its current value. */
export type SliderMemory = number;

const decimals = (step: number) => (String(step).split(".")[1] ?? "").length;

/** Rounds a value to the slider's steps and range. */
export function snapValue(slider: SliderElement, value: number): number {
    const steps = Math.round((value - slider.min) / slider.step);
    const snapped = slider.min + steps * slider.step;
    const clamped = Math.min(Math.max(snapped, slider.min), slider.max);
    // avoid floating-point tails like 101.10000000000001
    return Number(clamped.toFixed(decimals(slider.step)));
}

export function sliderValue(slider: SliderElement, memory: SliderMemory | undefined): number {
    return memory ?? snapValue(slider, slider.value ?? slider.min);
}

const formatValue = (slider: SliderElement, value: number) =>
    `${value.toFixed(decimals(slider.step))}${slider.unit}`;

/** Where the bar sits in the line, in characters. */
export function sliderLayout(slider: SliderElement, columns: number) {
    const label = slider.label ?? "";
    // room for the widest value, so the bar never changes width
    const valueWidth = slider.showValue
        ? Math.max(formatValue(slider, slider.min).length, formatValue(slider, slider.max).length)
        : 0;
    const reserve = slider.showValue ? valueWidth + 1 : 0;
    const width = slider.width ?? Math.max(4, columns - label.length - 2 - reserve);
    return { barStart: label.length + 1, width, valueWidth };
}

/** The line for a slider at `value`, fitted to `columns`. */
export function sliderLine(slider: SliderElement, value: number, columns: number): string {
    const { width, valueWidth } = sliderLayout(slider, columns);
    const fraction = (value - slider.min) / (slider.max - slider.min);
    const filled = Math.round(width * fraction);
    const shown = slider.showValue ? ` ${formatValue(slider, value).padStart(valueWidth)}` : "";
    return `${slider.label ?? ""}[${slider.fill.repeat(filled)}${slider.empty.repeat(width - filled)}]${shown}`;
}

/** The value for a position along the bar, from 0 (its left edge) to 1 (its right edge). */
export function valueAt(slider: SliderElement, fraction: number): number {
    const clamped = Math.min(Math.max(fraction, 0), 1);
    return snapValue(slider, slider.min + clamped * (slider.max - slider.min));
}

const matches = (rule: SliderRule, value: number, step: number) =>
    (rule.atLeast === undefined || value >= rule.atLeast) &&
    (rule.atMost === undefined || value <= rule.atMost) &&
    (rule.equals === undefined || Math.abs(value - rule.equals) < step / 2);

/** The line appears with the element's reveal, then follows the value. */
function createSliderReveal(
    slider: SliderElement,
    spec: RevealSpec,
    context: RevealContext,
): Reveal {
    const line = () =>
        sliderLine(
            slider,
            sliderValue(slider, context.memory() as SliderMemory | undefined),
            context.columns(),
        );
    const intro = createReveal(line(), spec, context.random);
    let last: Frame = [];
    const current = (): Frame => {
        const text = line();
        if (last.length !== 1 || last[0]?.text !== text) last = [{ kind: "visible", text }];
        return last;
    };
    return { duration: intro.duration, frame: (elapsed) => intro.frame(elapsed), final: current };
}

export const sliderModule: ModuleDefinition<SliderElement, SliderMemory> = {
    text: (slider, memory) => sliderLine(slider, sliderValue(slider, memory), 80),
    actions: (slider) => [
        ...(slider.on ?? []).map((rule) => rule.action),
        ...(slider.onEnter ? [slider.onEnter] : []),
    ],
    reveal: createSliderReveal,
    changed(slider, before, after): Action | undefined {
        const previous = sliderValue(slider, before);
        // the first rule the value has just moved into
        const rule = (slider.on ?? []).find(
            (r) => matches(r, after, slider.step) && !matches(r, previous, slider.step),
        );
        return rule?.action;
    },
};
