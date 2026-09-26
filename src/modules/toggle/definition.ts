import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";
import { VariableNameSchema } from "../../engine/schema/variables.ts";

export const ToggleSchema = z
    .strictObject({
        type: z.literal("toggle"),
        states: z
            .array(z.string().min(1))
            .min(2)
            .meta({ description: "The texts to cycle through, one per click" }),
        initial: z
            .int()
            .min(0)
            .optional()
            .meta({ description: "Index of the state shown first (default: 0)" }),
        variable: VariableNameSchema.optional().meta({
            description:
                "A variable that holds the toggle's state: true or false for two states (the " +
                "second is true), otherwise the state's index, from 0. It starts from the " +
                "variable's value, instead of initial.",
        }),
        ...ElementBaseShape,
    })
    .refine((toggle) => (toggle.initial ?? 0) < toggle.states.length, {
        path: ["initial"],
        message: "initial must be the index of one of the states",
    })
    .meta({
        description:
            "Text that cycles through states when clicked. It remembers its state when you come " +
            "back, and can keep it in a variable.",
    });

export type ToggleElement = z.output<typeof ToggleSchema> & ElementIdentity;

/** A toggle's memory is the index of its current state. */
export type ToggleMemory = number;

export const toggleModule: ModuleDefinition<ToggleElement, ToggleMemory> = {
    text: (element, memory) => element.states[toggleIndex(element, memory)] ?? "",
    binding: {
        check(element, initial) {
            if (element.initial !== undefined) {
                return 'A toggle with a "variable" starts from its value; remove "initial"';
            }
            if (typeof initial === "boolean") {
                return element.states.length === 2
                    ? null
                    : "A toggle bound to true or false needs exactly two states";
            }
            if (typeof initial === "number") {
                return Number.isInteger(initial) && initial >= 0 && initial < element.states.length
                    ? null
                    : `The variable must start at the index of a state, from 0 to ${element.states.length - 1}`;
            }
            return "A toggle can be bound to true or false, or a number";
        },
        // an action may have set the variable to any number
        read: (element, value) =>
            Math.min(Math.max(Math.trunc(Number(value)) || 0, 0), element.states.length - 1),
        write: (_element, memory, current) =>
            typeof current === "boolean" ? memory === 1 : memory,
    },
};

export function toggleIndex(element: ToggleElement, memory: ToggleMemory | undefined): number {
    return memory ?? element.initial ?? 0;
}

/** The memory after a click: the next state, wrapping around. */
export function nextToggleState(element: ToggleElement, memory: ToggleMemory | undefined) {
    return (toggleIndex(element, memory) + 1) % element.states.length;
}
