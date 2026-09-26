import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";

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
        ...ElementBaseShape,
    })
    .refine((toggle) => (toggle.initial ?? 0) < toggle.states.length, {
        path: ["initial"],
        message: "initial must be the index of one of the states",
    })
    .meta({
        description:
            "Text that cycles through states when clicked. It remembers its state when you come back.",
    });

export type ToggleElement = z.output<typeof ToggleSchema> & ElementIdentity;

/** A toggle's memory is the index of its current state. */
export type ToggleMemory = number;

export const toggleModule: ModuleDefinition<ToggleElement, ToggleMemory> = {
    text: (element, memory) => element.states[toggleIndex(element, memory)] ?? "",
};

export function toggleIndex(element: ToggleElement, memory: ToggleMemory | undefined): number {
    return memory ?? element.initial ?? 0;
}

/** The memory after a click: the next state, wrapping around. */
export function nextToggleState(element: ToggleElement, memory: ToggleMemory | undefined) {
    return (toggleIndex(element, memory) + 1) % element.states.length;
}
