import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ActionSchema, ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";
import { VariableNameSchema } from "../../engine/schema/variables.ts";

export const ChoiceMarkersSchema = z
    .strictObject({
        off: z.string().optional().meta({
            description: 'Before an option not chosen (default: "( )", or "[ ]" with multiple)',
        }),
        on: z.string().optional().meta({
            description: 'Before a chosen option (default: "(•)", or "[X]" with multiple)',
        }),
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
        multiple: z
            .boolean()
            .default(false)
            .meta({
                description:
                    "Let the player tick any number of options, like checkboxes, rather than " +
                    "choosing one (default: false)",
            }),
        initial: z
            .union([z.int().min(0), z.array(z.int().min(0))])
            .optional()
            .meta({
                description:
                    "The option chosen at first, by index from 0 (default: 0); with multiple, a " +
                    "list of the options ticked at first (default: none)",
            }),
        variable: VariableNameSchema.optional().meta({
            description:
                "A variable that holds the choice: the option's text for a text variable, its " +
                "index (from 0) for a number. It starts from the variable's value, instead of " +
                "initial. (Not with multiple: see variables.)",
        }),
        variables: z
            .array(VariableNameSchema.nullable())
            .optional()
            .meta({
                description:
                    "With multiple: a true/false variable for each option, in order, that holds " +
                    "whether it's ticked (null for an option without one). The options start " +
                    "from the variables, instead of initial.",
            }),
        onChange: ActionSchema.optional().meta({
            description: "What happens when the player changes the choice",
        }),
        markers: ChoiceMarkersSchema.optional().meta({
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
    .superRefine((choice, ctx) => {
        const problem = (path: PropertyKey[], message: string) =>
            ctx.addIssue({ code: "custom", path, message });
        const indices = [choice.initial ?? []].flat();
        if (indices.some((index) => index >= choice.options.length)) {
            problem(["initial"], "initial must be the index of one of the options");
        }
        if (choice.multiple) {
            if (typeof choice.initial === "number") {
                problem(["initial"], "With multiple, initial is a list of options, e.g. [0, 2]");
            }
            if (choice.variable !== undefined) {
                problem(["variable"], 'With multiple, use "variables": one for each option');
            }
            if ((choice.variables?.length ?? 0) > choice.options.length) {
                problem(["variables"], "There are more variables than options");
            }
        } else {
            if (Array.isArray(choice.initial)) {
                problem(["initial"], 'initial is a list only with "multiple": true');
            }
            if (choice.variables !== undefined) {
                problem(["variables"], 'variables are for "multiple": true; use "variable"');
            }
        }
    })
    .meta({
        description:
            "Options shown side by side: one chosen, like radio buttons, or with multiple, any " +
            "number ticked, like checkboxes. It remembers the choice, and can keep it in variables.",
    });

export type ChoiceElement = z.output<typeof ChoiceSchema> & ElementIdentity;

/**
 * A choice's memory: the chosen option's index, or with multiple, the ticked options'
 * indices, in order.
 */
export type ChoiceMemory = number | number[];

const SINGLE_MARKERS = { off: "( )", on: "(•)" };
const MULTIPLE_MARKERS = { off: "[ ]", on: "[X]" };

/** The marks a choice uses: its own, or radio-button (or checkbox) marks by default. */
export const markersOf = (choice: ChoiceElement) => {
    const defaults = choice.multiple ? MULTIPLE_MARKERS : SINGLE_MARKERS;
    return { off: choice.markers?.off ?? defaults.off, on: choice.markers?.on ?? defaults.on };
};

/** The options chosen (or ticked), by index. */
export function chosen(choice: ChoiceElement, memory: ChoiceMemory | undefined): number[] {
    if (memory !== undefined) return [memory].flat();
    if (choice.multiple) return [choice.initial ?? []].flat();
    return [typeof choice.initial === "number" ? choice.initial : 0];
}

/** The memory after the player picks an option: it's chosen, or with multiple, toggled. */
export function pick(choice: ChoiceElement, memory: ChoiceMemory | undefined, option: number) {
    if (!choice.multiple) return option;
    const ticked = chosen(choice, memory);
    return ticked.includes(option)
        ? ticked.filter((index) => index !== option)
        : [...ticked, option].sort((a, b) => a - b);
}

// no-break spaces within an option, so the row only wraps between options
const NBSP = " ";

/** An option as it's drawn: its marker, then its text. */
export const optionLabel = (choice: ChoiceElement, index: number, on: boolean) => {
    const markers = markersOf(choice);
    return `${on ? markers.on : markers.off} ${choice.options[index]}`.replace(/ /g, NBSP);
};

const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export const choiceModule: ModuleDefinition<ChoiceElement, ChoiceMemory> = {
    text: (choice, memory) => {
        const on = chosen(choice, memory);
        const options = choice.options.map((_, i) => optionLabel(choice, i, on.includes(i)));
        return choice.label + options.join(" ".repeat(choice.gap));
    },
    actions: (choice) => (choice.onChange ? [choice.onChange] : []),
    changed: (choice, before, after) =>
        same(chosen(choice, before), chosen(choice, after)) ? undefined : choice.onChange,
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
        write: (choice, memory, current) => {
            const index = chosen(choice, memory)[0] ?? 0;
            return typeof current === "string" ? (choice.options[index] ?? "") : index;
        },
    },
    // a multiple choice keeps each option's tick in its own true/false variable
    multiBinding: {
        variables: (choice) => (choice.multiple ? (choice.variables ?? []) : []),
        read: (choice, values, memory) => {
            const ticked = chosen(choice, memory);
            return choice.options.flatMap((_, i) => {
                const value = values[i];
                const on = value === undefined ? ticked.includes(i) : value === true;
                return on ? [i] : [];
            });
        },
        write: (choice, memory) => {
            const ticked = chosen(choice, memory);
            return choice.options.map((_, i) => ticked.includes(i));
        },
    },
};
