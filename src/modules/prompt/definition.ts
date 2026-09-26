import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { type Action, ActionSchema, ElementBaseShape } from "../../engine/schema/common.ts";
import {
    type Condition,
    ConditionSchema,
    VariableNameSchema,
} from "../../engine/schema/variables.ts";

export const CommandSchema = z
    .strictObject({
        command: z
            .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
            .meta({ description: "What to type (case-insensitive). Use an array for aliases." }),
        if: ConditionSchema.optional().meta({
            description: "Only understood while this holds",
        }),
        action: ActionSchema.meta({ description: "What happens when the command is entered" }),
    })
    .meta({ description: "A command the prompt understands" });

export const PromptSchema = z
    .strictObject({
        type: z.literal("prompt"),
        prompt: z
            .string()
            .default("> ")
            .meta({ description: 'Text shown before the input (default: "> ")' }),
        commands: z
            .array(CommandSchema)
            .min(1)
            .optional()
            .meta({ description: "The commands it understands" }),
        onEnter: ActionSchema.optional().meta({
            description:
                "What happens when the input matches no command, e.g. after typing a name " +
                "into a variable. Without it, the prompt says it doesn't understand.",
        }),
        variable: VariableNameSchema.optional().meta({
            description: "A text variable that gets whatever is entered, before any action",
        }),
        unknown: z
            .string()
            .default("Unknown command.")
            .meta({ description: "Shown when the input matches no command" }),
        ...ElementBaseShape,
    })
    .refine((prompt) => prompt.commands !== undefined || prompt.onEnter !== undefined, {
        message: 'Give the prompt "commands", "onEnter", or both',
    })
    .meta({
        description:
            "A command line. Typed commands navigate, open dialogs or change variables; it can " +
            "also take free text, such as a name or a password, into a variable.",
    });

export type PromptElement = z.output<typeof PromptSchema> & ElementIdentity;

export const promptModule: ModuleDefinition<PromptElement, string> = {
    text: (element) => element.prompt,
    actions: (element) => [
        ...(element.commands ?? []).map((command) => command.action),
        ...(element.onEnter ? [element.onEnter] : []),
    ],
    conditions: (element) => (element.commands ?? []).flatMap((command) => command.if ?? []),
    binding: {
        check: (_element, initial) =>
            typeof initial === "string" ? null : "A prompt can only be bound to a text variable",
        read: (_element, value) => String(value),
        write: (_element, memory) => memory,
    },
};

const normalize = (input: string) => input.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The action for what the user typed: a command's, or else onEnter. Null if the input is
 * blank or understood by nothing. `holds` tests a command's condition.
 */
export function matchCommand(
    element: PromptElement,
    input: string,
    holds: (condition: Condition) => boolean = () => true,
): Action | null {
    const typed = normalize(input);
    if (!typed) return null;

    for (const { command, if: condition, action } of element.commands ?? []) {
        const names = Array.isArray(command) ? command : [command];
        if (condition && !holds(condition)) continue;
        if (names.some((name) => normalize(name) === typed)) return action;
    }
    return element.onEnter ?? null;
}
