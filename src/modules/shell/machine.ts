// What a shell does with what's typed: the file tree, paths, and the built-in commands. Apart
// from any view, so it can be tested.

import type { Action } from "../../engine/schema/common.ts";
import type { Condition } from "../../engine/schema/variables.ts";
import {
    SHELL_DEFAULTS,
    type ShellElement,
    type ShellFolder,
    type ShellNode,
    shellNode,
} from "./definition.ts";

export interface ShellResult {
    /** Lines to print. */
    output: string[];
    /** The folder it's in afterwards, as names from the top. */
    cwd: string[];
    /** Wipe what's on screen first (clear, cls). */
    clear?: boolean;
    /** An action to run, after printing. */
    action?: Action;
    /** It wasn't understood, or failed. */
    error?: boolean;
    /**
     * It needs a password first: for the file, program or folder at `key` (its path). Once
     * it's given, run the command again with `key` among the unlocked.
     */
    ask?: { key: string; password: string };
}

type Holds = (condition: Condition) => boolean;

/** A path's key, for remembering it's been unlocked: /logs/secret.txt */
export const pathKey = (path: readonly string[]) => `/${path.join("/")}`;

/**
 * The first thing along a path (a folder on the way, or what's at its end) with a password
 * that hasn't been given yet, or null if the way is open.
 */
function locked(
    shell: ShellElement,
    path: string[],
    holds: Holds,
    unlocked: readonly string[],
): { key: string; password: string } | null {
    for (let i = 1; i <= path.length; i++) {
        const node = at(shell, path.slice(0, i), holds);
        const key = pathKey(path.slice(0, i));
        if (node?.password !== undefined && !unlocked.includes(key)) {
            return { key, password: node.password };
        }
    }
    return null;
}

const BUILT_INS = {
    unix: ["help", "ls", "cd", "cat", "pwd", "clear"],
    dos: ["HELP", "DIR", "CD", "TYPE", "CLS"],
};

/** What's in a folder (that's there now), in order. */
function entries(folder: ShellFolder, holds: Holds): [string, ShellNode][] {
    return Object.entries(folder)
        .map(([name, raw]): [string, ShellNode] => [name, shellNode(raw)])
        .filter(([, node]) => !node.if || holds(node.if));
}

/** The node at a path of names from the top (the top itself for []). */
function at(shell: ShellElement, path: string[], holds: Holds): ShellNode | null {
    let node: ShellNode = { kind: "folder", folder: shell.files ?? {} };
    for (const name of path) {
        if (node.kind !== "folder") return null;
        const next: [string, ShellNode] | undefined = entries(node.folder, holds).find(
            ([key]) => key === name,
        );
        if (!next) return null;
        node = next[1];
    }
    return node;
}

/** A name in a folder, ignoring case: its real spelling, or null. */
function find(folder: ShellFolder, name: string, holds: Holds): string | null {
    const lower = name.toLowerCase();
    return entries(folder, holds).find(([key]) => key.toLowerCase() === lower)?.[0] ?? null;
}

/** Where a typed path leads from `cwd`, as names from the top, or null if nowhere. */
export function resolve(
    shell: ShellElement,
    cwd: string[],
    typed: string,
    holds: Holds,
): string[] | null {
    const separator = shell.style === "dos" ? /[\\/]/ : /\//;
    const absolute = /^[\\/]/.test(typed);
    const path = absolute ? [] : [...cwd];
    for (const part of typed.split(separator).filter(Boolean)) {
        if (part === ".") continue;
        if (part === "..") {
            path.pop();
            continue;
        }
        const node = at(shell, path, holds);
        if (node?.kind !== "folder") return null;
        const name = find(node.folder, part, holds);
        if (name === null) return null;
        path.push(name);
    }
    return path;
}

/** The folder as shown: /logs/old, or \LOGS\OLD. */
export function showPath(shell: ShellElement, cwd: string[]): string {
    // (DOS shows names in capitals, whatever they're written in)
    return shell.style === "dos" ? `\\${cwd.join("\\").toUpperCase()}` : `/${cwd.join("/")}`;
}

/** The prompt, with {cwd} filled in. */
export function promptFor(shell: ShellElement, cwd: string[]): string {
    const prompt = shell.prompt ?? SHELL_DEFAULTS[shell.style].prompt;
    return prompt.replaceAll("{cwd}", showPath(shell, cwd));
}

const bytes = (node: ShellNode) =>
    node.kind === "file"
        ? node.text.reduce((sum, line) => sum + line.length + 1, 0)
        : node.kind === "program"
          ? (node.size ?? 24_576)
          : 0;

/** A folder's listing: ls's names, or DIR's table. */
function listing(shell: ShellElement, path: string[], holds: Holds): string[] {
    const node = at(shell, path, holds);
    if (node?.kind !== "folder") return [];
    const items = entries(node.folder, holds);
    if (shell.style === "unix") {
        const names = items.map(([name, item]) => (item.kind === "folder" ? `${name}/` : name));
        return names.length > 0 ? [names.join("  ")] : [];
    }
    const number = (n: number) => n.toLocaleString("en-US");
    const nameWidth = Math.max(12, ...items.map(([name]) => name.length));
    const files = items.filter(([, item]) => item.kind !== "folder");
    const total = files.reduce((sum, [, item]) => sum + bytes(item), 0);
    return [
        ` Directory of C:${showPath(shell, path)}`,
        "",
        ...items.map(([name, item]) =>
            `${name.toUpperCase().padEnd(nameWidth)}  ${(item.kind === "folder" ? "<DIR>" : number(bytes(item))).padStart(8)}  ${item.date ?? ""}`.trimEnd(),
        ),
        `${String(files.length).padStart(10)} file(s)  ${number(total).padStart(12)} bytes`,
    ];
}

/** A program that `name` (as typed) runs, from `cwd`: by path, or DOS-style without .EXE. */
function program(
    shell: ShellElement,
    cwd: string[],
    name: string,
    holds: Holds,
): { node: ShellNode; path: string[] } | null {
    const typed = shell.style === "unix" ? name.replace(/^\.\//, "") : name;
    const candidates =
        shell.style === "dos" && !/\.[a-z]+$/i.test(typed)
            ? [".EXE", ".COM", ".BAT"].map((extension) => typed + extension)
            : [typed];
    for (const candidate of candidates) {
        // the folder part as typed (keeping a leading / or \, for a path from the top)
        const cut =
            Math.max(
                candidate.lastIndexOf("/"),
                shell.style === "dos" ? candidate.lastIndexOf("\\") : -1,
            ) + 1;
        const file = candidate.slice(cut);
        const folder = resolve(shell, cwd, candidate.slice(0, cut), holds);
        if (!folder) continue;
        const where = at(shell, folder, holds);
        if (where?.kind !== "folder") continue;
        const real = find(where.folder, file, holds);
        const path = real === null ? null : [...folder, real];
        const node = path && at(shell, path, holds);
        if (node?.kind === "program" && path) return { node, path };
    }
    return null;
}

const normalize = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/** What happens when `input` is entered, in the folder `cwd`. */
export function runCommand(
    shell: ShellElement,
    input: string,
    cwd: string[],
    holds: Holds = () => true,
    /** The paths whose passwords have been given (see pathKey). */
    unlocked: readonly string[] = [],
): ShellResult {
    const typed = normalize(input);
    // a password needed on the way there
    const ask = (path: string[]): ShellResult | null => {
        const lock = locked(shell, path, holds, unlocked);
        return lock ? { output: [], cwd, ask: lock } : null;
    };
    const same = { output: [] as string[], cwd };
    if (!typed) return same;

    // commands of the program's own come first
    for (const command of shell.commands ?? []) {
        if (command.if && !holds(command.if)) continue;
        const names = Array.isArray(command.command) ? command.command : [command.command];
        if (!names.some((name) => normalize(name) === typed)) continue;
        const output =
            command.output === undefined
                ? []
                : [command.output].flat().flatMap((text) => text.split("\n"));
        return { output, cwd, action: command.action };
    }

    const dos = shell.style === "dos";
    // (DOS takes "cd.." and "cd\" for "cd .." and "cd \")
    const [first = "", ...rest] = input
        .trim()
        .replace(/^cd(?=\.\.|\\)/i, "cd ")
        .split(/\s+/);
    const word = first.toLowerCase();
    const arg = rest.join(" ");
    const fail = (message: string): ShellResult => ({ output: [message], cwd, error: true });

    switch (word) {
        case "help":
        case "?": {
            const builtIns = BUILT_INS[shell.style];
            const own = (shell.commands ?? [])
                .filter((command) => !command.if || holds(command.if))
                .map((command) => [command.command].flat()[0] ?? "");
            const all = [...builtIns, ...(shell.exit ? [dos ? "EXIT" : "exit"] : []), ...own];
            return { output: [`${dos ? "COMMANDS" : "commands"}: ${all.join("  ")}`], cwd };
        }
        case "ls":
        case "dir": {
            if (dos !== (word === "dir")) break;
            const path = arg ? resolve(shell, cwd, arg, holds) : cwd;
            if (!path || at(shell, path, holds)?.kind !== "folder") {
                return fail(dos ? "File not found" : `ls: ${arg}: No such file or directory`);
            }
            return ask(path) ?? { output: listing(shell, path, holds), cwd };
        }
        case "cd":
        case "chdir": {
            if (!arg)
                return dos
                    ? { output: [`C:${showPath(shell, cwd)}`], cwd }
                    : { output: [], cwd: [] };
            const path = resolve(shell, cwd, arg, holds);
            if (!path || at(shell, path, holds)?.kind !== "folder") {
                return fail(dos ? "Invalid directory" : `cd: ${arg}: No such file or directory`);
            }
            return ask(path) ?? { output: [], cwd: path };
        }
        case "cat":
        case "type": {
            if (dos !== (word === "type")) break;
            if (!arg) return fail(dos ? "Required parameter missing" : "cat: missing file operand");
            const path = resolve(shell, cwd, arg, holds);
            const node = path && at(shell, path, holds);
            if (!node)
                return fail(dos ? "File not found" : `cat: ${arg}: No such file or directory`);
            const needs = ask(path);
            if (needs) return needs;
            if (node.kind === "folder") {
                return fail(dos ? "Access denied" : `cat: ${arg}: Is a directory`);
            }
            if (node.kind === "program") {
                return {
                    output: [
                        "MZ\u00ff\u00ff \u00b8 @ \u00ba \u00b4 \u00cd!\u00b8 L\u00cd!This program cannot be run in DOS mode.",
                    ],
                    cwd,
                };
            }
            return { output: node.text, cwd };
        }
        case "pwd":
            if (dos) break;
            return { output: [showPath(shell, cwd)], cwd };
        case "clear":
        case "cls":
            if (dos !== (word === "cls")) break;
            return { output: [], cwd, clear: true };
        case "exit":
            if (!shell.exit) break;
            return { output: [], cwd, action: shell.exit };
    }

    // a program, by name
    const run = program(shell, cwd, input.trim().split(/\s+/)[0] ?? "", holds);
    if (run?.node.kind === "program")
        return ask(run.path) ?? { output: [], cwd, action: run.node.run };

    const unknown = shell.unknown ?? SHELL_DEFAULTS[shell.style].unknown;
    return fail(unknown.replaceAll("{command}", input.trim().split(/\s+/)[0] ?? ""));
}

/** What's typed, with its last word completed (as far as it's certain) by Tab. */
export function complete(
    shell: ShellElement,
    input: string,
    cwd: string[],
    holds: Holds = () => true,
): string {
    const match = /^(.*?)(\S*)$/.exec(input);
    const before = match?.[1] ?? "";
    const word = match?.[2] ?? "";
    const dos = shell.style === "dos";
    const separator = dos ? /[\\/]/ : /\//;

    // what the word could be: a command (as the first word), or a name in a folder
    const slash = Math.max(word.lastIndexOf("/"), dos ? word.lastIndexOf("\\") : -1);
    const folderPart = slash === -1 ? "" : word.slice(0, slash + 1);
    const namePart = slash === -1 ? word : word.slice(slash + 1);
    const folder = resolve(shell, cwd, folderPart.replace(separator, "/"), holds);
    const node = folder && at(shell, folder, holds);
    const names =
        node?.kind === "folder"
            ? entries(node.folder, holds).map(([name, item]) =>
                  item.kind === "folder" ? `${name}${dos ? "\\" : "/"}` : name,
              )
            : [];
    const commands =
        before.trim() === ""
            ? [
                  ...BUILT_INS[shell.style],
                  ...(shell.commands ?? []).flatMap((command) => [command.command].flat()),
              ]
            : [];

    const lower = namePart.toLowerCase();
    const options = [...new Set([...commands, ...names])].filter((option) =>
        option.toLowerCase().startsWith(lower),
    );
    if (options.length === 0) return input;
    // as far as they all agree
    let common = options[0] ?? "";
    for (const option of options.slice(1)) {
        let i = 0;
        while (i < common.length && common[i]?.toLowerCase() === option[i]?.toLowerCase()) i++;
        common = common.slice(0, i);
    }
    if (common.length <= namePart.length) return input;
    const finished = options.length === 1 && !/[\\/]$/.test(common) ? " " : "";
    return `${before}${folderPart}${common}${finished}`;
}
