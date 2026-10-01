import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { type Action, ActionSchema, ElementBaseShape } from "../../engine/schema/common.ts";
import { type Condition, ConditionSchema } from "../../engine/schema/variables.ts";

const LinesSchema = z
    .union([z.string(), z.array(z.string())])
    .meta({ description: "Text: a string, or a list of lines" });

const ifShape = {
    if: ConditionSchema.optional().meta({ description: "Only there while this holds" }),
};

export const ShellFileSchema = z
    .strictObject({
        file: LinesSchema.meta({ description: "The file's text: a string, or a list of lines" }),
        date: z.string().optional().meta({ description: "When it was last changed, as you like" }),
        ...ifShape,
    })
    .meta({ description: "A text file, with settings" });

export const ShellProgramSchema = z
    .strictObject({
        run: ActionSchema.meta({ description: "What happens when it's run (by typing its name)" }),
        size: z.int().min(0).optional().meta({ description: "Its size in bytes, for listings" }),
        date: z.string().optional().meta({ description: "When it was last changed, as you like" }),
        ...ifShape,
    })
    .meta({ description: "A program: typing its name runs its action" });

/** A folder's contents as written: names, and what they are. */
export type ShellFolderInput = { [name: string]: ShellNodeInput };
export type ShellNodeInput =
    | string
    | string[]
    | z.input<typeof ShellFileSchema>
    | z.input<typeof ShellProgramSchema>
    | { folder: ShellFolderInput; date?: string; if?: unknown }
    | ShellFolderInput;

export const ShellFolderSchema: z.ZodType<ShellFolder, ShellFolderInput> = z
    .lazy(() => z.record(z.string().min(1), ShellNodeSchema))
    .meta({
        id: "ShellFolder",
        description:
            "A folder's contents: names, each a text file (a string, or a list of lines), a " +
            'folder (an object of names), or { "file" }, { "run" } or { "folder" } with settings',
    });

export const ShellFolderEntrySchema = z
    .strictObject({
        folder: z
            .lazy(() => ShellFolderSchema)
            .meta({ description: "What's in the folder: names, and what they are" }),
        date: z.string().optional().meta({ description: "When it was last changed, as you like" }),
        ...ifShape,
    })
    .meta({ description: "A folder, with settings" });

const ShellNodeSchema = z.union([
    LinesSchema,
    ShellFileSchema,
    ShellProgramSchema,
    ShellFolderEntrySchema,
    ShellFolderSchema,
]);

export const ShellCommandSchema = z
    .strictObject({
        command: z
            .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
            .meta({ description: "What to type (case-insensitive). Use an array for aliases." }),
        output: LinesSchema.optional().meta({
            description: "What it prints: a string or a list of lines, which can show variables",
        }),
        action: ActionSchema.optional().meta({ description: "What happens, after any output" }),
        ...ifShape,
    })
    .refine((command) => command.output !== undefined || command.action !== undefined, {
        message: 'Give the command "output", an "action", or both',
    })
    .meta({ description: "A command of your own" });

export const SHELL_DEFAULTS = {
    unix: { prompt: "user@teletronix:{cwd}$ ", unknown: "{command}: command not found" },
    dos: { prompt: "C:{cwd}>", unknown: "Bad command or file name" },
};

export const ShellSchema = z
    .strictObject({
        type: z.literal("shell"),
        style: z
            .enum(["unix", "dos"])
            .default("unix")
            .meta({
                description:
                    'How it looks and which commands it knows: "unix" (ls, cat, cd, pwd, clear) or ' +
                    '"dos" (DIR, TYPE, CD, CLS) (default: "unix")',
            }),
        files: ShellFolderSchema.optional().meta({
            description: "The files and folders, from the top folder down",
        }),
        commands: z.array(ShellCommandSchema).optional().meta({
            description: "Commands of your own, besides the built-in ones",
        }),
        prompt: z
            .string()
            .optional()
            .meta({
                description:
                    'The prompt, where {cwd} is the folder it\'s in (default: "user@teletronix:{cwd}$ " ' +
                    'for unix, "C:{cwd}>" for dos)',
            }),
        unknown: z
            .string()
            .optional()
            .meta({
                description:
                    "What it says for a command it doesn't know, where {command} is what was typed " +
                    '(default: "{command}: command not found" for unix, "Bad command or file name" for dos)',
            }),
        exit: ActionSchema.optional().meta({
            description: 'What "exit" does (without one, exit isn\'t a command)',
        }),
        ...ElementBaseShape,
    })
    .meta({
        description:
            "A command line over a little computer of your own: files and folders to list, " +
            "read and move between, programs to run, and commands of your own. It keeps a " +
            "transcript, like a real terminal.",
    });

export type ShellElement = z.output<typeof ShellSchema> & ElementIdentity;

// ─── The file tree, as parsed ──────────────────────────────────────────────

export type ShellNode =
    | { kind: "file"; text: string[]; date?: string; if?: Condition }
    | { kind: "program"; run: Action; size?: number; date?: string; if?: Condition }
    | { kind: "folder"; folder: ShellFolder; date?: string; if?: Condition };

/** A folder's contents, as parsed. (An interface, so it can refer to itself.) */
export interface ShellFolder {
    [name: string]: ShellNodeOutput;
}
type ShellNodeOutput =
    | string
    | string[]
    | z.output<typeof ShellFileSchema>
    | z.output<typeof ShellProgramSchema>
    | { folder: ShellFolder; date?: string; if?: Condition }
    | ShellFolder;

const lines = (text: string | string[]) => (Array.isArray(text) ? text : text.split("\n"));

/** A file tree node as written, made explicit. */
export function shellNode(node: ShellNodeOutput): ShellNode {
    if (typeof node === "string" || Array.isArray(node)) return { kind: "file", text: lines(node) };
    if ("file" in node && (typeof node.file === "string" || Array.isArray(node.file))) {
        const file = node as z.output<typeof ShellFileSchema>;
        return { kind: "file", text: lines(file.file), date: file.date, if: file.if };
    }
    if ("run" in node && Array.isArray(node.run)) {
        const program = node as z.output<typeof ShellProgramSchema>;
        return {
            kind: "program",
            run: program.run,
            size: program.size,
            date: program.date,
            if: program.if,
        };
    }
    if ("folder" in node && typeof node.folder === "object" && !Array.isArray(node.folder)) {
        const folder = node as { folder: ShellFolder; date?: string; if?: Condition };
        return { kind: "folder", folder: folder.folder, date: folder.date, if: folder.if };
    }
    return { kind: "folder", folder: node as ShellFolder };
}

/** Every action and condition in a file tree, for checking. */
function walk(folder: ShellFolder | undefined, visit: (node: ShellNode) => void): void {
    for (const raw of Object.values(folder ?? {})) {
        const node = shellNode(raw);
        visit(node);
        if (node.kind === "folder") walk(node.folder, visit);
    }
}

export const shellModule: ModuleDefinition<ShellElement> = {
    // (the view draws its prompt and transcript)
    text: () => "",
    actions: (shell) => {
        const actions: Action[] = [];
        if (shell.exit) actions.push(shell.exit);
        for (const command of shell.commands ?? [])
            if (command.action) actions.push(command.action);
        walk(shell.files, (node) => {
            if (node.kind === "program") actions.push(node.run);
        });
        return actions;
    },
    conditions: (shell) => {
        const conditions: Condition[] = [];
        for (const command of shell.commands ?? []) if (command.if) conditions.push(command.if);
        walk(shell.files, (node) => {
            if (node.if) conditions.push(node.if);
        });
        return conditions;
    },
};
