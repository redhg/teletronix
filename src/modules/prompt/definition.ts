import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { type Action, ActionSchema, ElementBaseShape } from "../../engine/schema/common.ts";

const CommandSchema = z.strictObject({
    command: z
        .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
        .meta({ description: "What to type (case-insensitive). Use an array for aliases." }),
    action: ActionSchema.meta({ description: "What happens when the command is entered" }),
});

export const PromptSchema = z
    .strictObject({
        type: z.literal("prompt"),
        prompt: z
            .string()
            .default("> ")
            .meta({ description: 'Text shown before the input (default: "> ")' }),
        commands: z.array(CommandSchema).min(1),
        unknown: z
            .string()
            .default("Unknown command.")
            .meta({ description: "Shown when the input matches no command" }),
        ...ElementBaseShape,
    })
    .meta({ description: "A command line. Typed commands navigate or open dialogs." });

export type PromptElement = z.output<typeof PromptSchema> & ElementIdentity;

export const promptModule: ModuleDefinition<PromptElement> = {
    text: (element) => element.prompt,
    actions: (element) => element.commands.map((command) => command.action),
};

const normalize = (input: string) => input.trim().replace(/\s+/g, " ").toLowerCase();

/** The action for what the user typed, or null if it matches no command. */
export function matchCommand(element: PromptElement, input: string): Action | null {
    const typed = normalize(input);
    if (!typed) return null;

    for (const { command, action } of element.commands) {
        const names = Array.isArray(command) ? command : [command];
        if (names.some((name) => normalize(name) === typed)) return action;
    }
    return null;
}
