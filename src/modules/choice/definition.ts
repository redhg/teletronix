import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ActionSchema, ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";
import { VariableNameSchema } from "../../engine/schema/variables.ts";

export const ChoiceMarkersSchema = z
    .strictObject({
        off: z
            .string()
            .default("( )")
            .meta({ description: 'Before an option not chosen (default: "( )")' }),
        on: z
            .string()
            .default("(•)")
            .meta({ description: 'Before the chosen option (default: "(•)")' }),
    })
    .meta({ description: "What each option shows before its text" });

export const ChoiceSchema = z
    .strictObject({
        type: z.literal("choice"),
        label: z
            .string()
            .default("")
            .meta({ description: 'Text before the options, e.g. "POWER: "' }),
        options: z
            .array(z.string().min(1))
            .min(2)
            .meta({ description: "The options, left to right" }),
        initial: z
            .int()
            .min(0)
            .optional()
            .meta({ description: "Index of the option chosen at first (default: 0)" }),
        variable: VariableNameSchema.optional().meta({
            description:
                "A variable that holds the choice: the option's text for a text variable, its " +
                "index (from 0) for a number. It starts from the variable's value, instead of initial.",
        }),
        onChange: ActionSchema.optional().meta({
            description: "What happens when the player chooses a different option",
        }),
        markers: ChoiceMarkersSchema.default({ off: "( )", on: "(•)" }).meta({
            description: 'What each option shows before its text, e.g. "[ ]" and "[X]"',
        }),
        gap: z
            .int()
            .min(1)
            .default(2)
            .meta({ description: "Characters between the options (default: 2)" }),
        align: ElementAlignSchema,
        ...ElementBaseShape,
    })
    .refine((choice) => (choice.initial ?? 0) < choice.options.length, {
        path: ["initial"],
        message: "initial must be the index of one of the options",
    })
    .meta({
        description:
            "One of several options, chosen with a click or the arrow keys, shown side by side " +
            "like radio buttons. It remembers the choice, and can keep it in a variable.",
    });

export type ChoiceElement = z.output<typeof ChoiceSchema> & ElementIdentity;

// no-break spaces within an option, so the row only wraps between options
const NBSP = " ";

/** The chosen option's index. */
export const chosenIndex = (choice: ChoiceElement, memory: number | undefined) =>
    memory ?? choice.initial ?? 0;

/** An option as it's drawn: its marker, then its text. */
export const optionLabel = (choice: ChoiceElement, index: number, chosen: number) =>
    `${index === chosen ? choice.markers.on : choice.markers.off} ${choice.options[index]}`.replace(
        / /g,
        NBSP,
    );

/** A choice's memory is the chosen option's index. */
export const choiceModule: ModuleDefinition<ChoiceElement, number> = {
    text: (choice, memory) => {
        const chosen = chosenIndex(choice, memory);
        const options = choice.options.map((_, i) => optionLabel(choice, i, chosen));
        return choice.label + options.join(" ".repeat(choice.gap));
    },
    actions: (choice) => (choice.onChange ? [choice.onChange] : []),
    changed: (choice, before, after) =>
        chosenIndex(choice, before) !== after ? choice.onChange : undefined,
    binding: {
        check(choice, initial) {
            if (choice.initial !== undefined) {
                return 'A choice with a "variable" starts from its value; remove "initial"';
            }
            if (typeof initial === "string") {
                return choice.options.includes(initial)
                    ? null
                    : `The variable must start as one of the options: ${choice.options.join(", ")}`;
            }
            if (typeof initial === "number") {
                return Number.isInteger(initial) && initial >= 0 && initial < choice.options.length
                    ? null
                    : `The variable must start at an option's index, from 0 to ${choice.options.length - 1}`;
            }
            return "A choice can be bound to text or a number";
        },
        read: (choice, value) => {
            const index =
                typeof value === "string"
                    ? choice.options.indexOf(value)
                    : Math.trunc(Number(value));
            return index >= 0 && index < choice.options.length ? index : 0;
        },
        write: (choice, memory, current) =>
            typeof current === "string" ? (choice.options[memory] ?? "") : memory,
    },
};
