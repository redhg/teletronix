import type { z } from "zod";
import { ElementSchema } from "../engine/schema/elements.ts";
import type { ProgramFile } from "./EditorApp.tsx";

/** A screen as written. */
export type ScreenFile = Record<string, unknown> & { content?: unknown[]; parent?: string };

/** A program's screens, as written. */
export const screensOf = (file: ProgramFile) => (file.screens ?? {}) as Record<string, ScreenFile>;

/** A preset's settings that name a screen (a conversation's "next" names its own parts). */
const PRESET_SCREEN_KEYS = ["next", "lockout", "failNext", "aborted"];

/**
 * The program with a screen renamed, and everything that names it: links' and other actions'
 * `screen`, frames' and tree items' `screen`, screens' `parent`, presets' `next` (and the
 * like), and the start screen. The screen keeps its place among the others.
 */
export function renameScreen(file: ProgramFile, from: string, to: string): ProgramFile {
    const rename = (value: unknown): unknown => (value === from ? to : value);
    const walk = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(walk);
        if (value === null || typeof value !== "object") return value;
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                key,
                key === "screen"
                    ? Array.isArray(item)
                        ? item.map(rename)
                        : rename(item)
                    : walk(item),
            ]),
        );
    };
    const screens = Object.fromEntries(
        Object.entries(screensOf(file)).map(([id, screen]) => {
            const renamed = walk(screen) as ScreenFile;
            if (renamed.parent === from) renamed.parent = to;
            const preset = renamed.preset as Record<string, unknown> | undefined;
            if (preset) {
                for (const key of PRESET_SCREEN_KEYS) {
                    if (preset[key] === from) preset[key] = to;
                }
            }
            return [id === from ? to : id, renamed];
        }),
    );
    const { screens: _, ...rest } = walk(file) as ProgramFile;
    const config = rest.config ? { ...rest.config } : undefined;
    if (config && config.start === from) config.start = to;
    return { ...rest, ...(config ? { config } : {}), screens };
}

/** The program with a screen added after `after` (or at the end), keeping the others' order. */
export function insertScreen(
    file: ProgramFile,
    id: string,
    screen: ScreenFile,
    after?: string,
): ProgramFile {
    const entries = Object.entries(screensOf(file));
    const at = after === undefined ? -1 : entries.findIndex(([key]) => key === after);
    entries.splice(at === -1 ? entries.length : at + 1, 0, [id, screen]);
    return { ...file, screens: Object.fromEntries(entries) };
}

/** An id like `base` that isn't taken: base, base-2, base-3… */
export function freeId(taken: Iterable<string>, base: string): string {
    const used = new Set(taken);
    if (!used.has(base)) return base;
    for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

// ─── Elements ────────────────────────────────────────────────────────────────

type ElementOption = (typeof ElementSchema.options)[number];

/** Every element type, with its schema and what it is, in the registry's order. */
export const ELEMENT_TYPES: { type: string; schema: z.ZodType; description: string }[] =
    ElementSchema.options.map((option: ElementOption) => ({
        type: (option.shape.type as { value: string }).value,
        schema: option as z.ZodType,
        description: (option.meta()?.description as string | undefined) ?? "",
    }));

/** An element as written: a bare string (a line of text), or an object with a type. */
export type ElementFile = string | (Record<string, unknown> & { type?: string });

/** An element's type: "text" for a bare string. */
export const typeOf = (element: ElementFile): string =>
    typeof element === "string" ? "text" : String(element.type ?? "?");

/** A line saying what an element is, for its row in a list: its text, title, source… */
export function summarize(element: ElementFile): string {
    if (typeof element === "string") return element;
    for (const key of ["text", "title", "label", "prompt", "src", "alt", "name", "variable"]) {
        const value = element[key];
        if (typeof value === "string" && value !== "") return value;
        if (Array.isArray(value) && typeof value[0] === "string") return value.join(" / ");
    }
    const items = element.items ?? element.options ?? element.buttons ?? element.frames;
    if (Array.isArray(items)) return `${items.length} ${items.length === 1 ? "item" : "items"}`;
    const content = element.content ?? element.slides;
    if (Array.isArray(content)) return `${content.length} inside`;
    return "";
}

/** A new element of a type, to fill in: a line of text is a bare string. */
export function newElement(type: string): ElementFile {
    return type === "text" ? "" : { type };
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

/** A program's dialogs, as written. */
export const dialogsOf = (file: ProgramFile) =>
    (file.dialogs ?? {}) as Record<string, Record<string, unknown>>;

/** The program with a dialog renamed, and every action that opens it (its `dialog`). */
export function renameDialog(file: ProgramFile, from: string, to: string): ProgramFile {
    const rename = (value: unknown): unknown => (value === from ? to : value);
    const walk = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(walk);
        if (value === null || typeof value !== "object") return value;
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                key,
                key === "dialog"
                    ? Array.isArray(item)
                        ? item.map(rename)
                        : rename(item)
                    : walk(item),
            ]),
        );
    };
    const { dialogs: _, ...rest } = walk(file) as ProgramFile;
    const dialogs = Object.fromEntries(
        Object.entries(dialogsOf(file)).map(([id, dialog]) => [
            id === from ? to : id,
            walk(dialog),
        ]),
    );
    return { ...rest, dialogs };
}

// ─── Sounds ──────────────────────────────────────────────────────────────────

/** The program with a sound renamed, and everything that plays it (`"sound": "its-name"`). */
export function renameSound(file: ProgramFile, from: string, to: string): ProgramFile {
    const walk = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(walk);
        if (value === null || typeof value !== "object") return value;
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                key,
                key === "sound" && item === from ? to : walk(item),
            ]),
        );
    };
    const { sounds, ...rest } = walk(file) as ProgramFile;
    return {
        ...rest,
        sounds: Object.fromEntries(
            Object.entries((sounds ?? {}) as Record<string, unknown>).map(([id, sound]) => [
                id === from ? to : id,
                sound,
            ]),
        ),
    };
}

// ─── Variables ───────────────────────────────────────────────────────────────

/** Settings that hold a variable's (or timer's) name: one, or a list of them. */
const VARIABLE_KEYS = new Set([
    "variable",
    "variables",
    "timer",
    "startTimer",
    "stopTimer",
    "resetTimer",
    "x",
    "y",
    "range",
]);

/**
 * The program with a variable or timer renamed (they share their names), and everything that
 * names it: "{name}" in text, conditions (`if`), assignments (`set`), the elements bound to it
 * (`variable`, a choice's `variables`, a timer element's `timer`, a star map marker's `x`, `y` and `range`),
 * and the actions that start, stop and reset a timer. It keeps its place among the others.
 */
export function renameVariable(file: ProgramFile, from: string, to: string): ProgramFile {
    const rename = (value: unknown): unknown => (value === from ? to : value);
    const renameKeys = (value: unknown): unknown =>
        value === null || typeof value !== "object" || Array.isArray(value)
            ? value
            : Object.fromEntries(Object.entries(value).map(([key, item]) => [rename(key), item]));
    const condition = (value: unknown): unknown => {
        if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) =>
                key === "all" || key === "any"
                    ? [key, Array.isArray(item) ? item.map(condition) : item]
                    : key === "not"
                      ? [key, condition(item)]
                      : [rename(key), item],
            ),
        );
    };
    const walk = (value: unknown): unknown => {
        if (typeof value === "string") return value.split(`{${from}}`).join(`{${to}}`);
        if (Array.isArray(value)) return value.map(walk);
        if (value === null || typeof value !== "object") return value;
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                key,
                key === "if"
                    ? condition(item)
                    : key === "set"
                      ? renameKeys(item)
                      : VARIABLE_KEYS.has(key) && typeof item !== "object"
                        ? rename(item)
                        : VARIABLE_KEYS.has(key) && Array.isArray(item)
                          ? item.map(rename)
                          : walk(item),
            ]),
        );
    };
    const renamed = walk(file) as ProgramFile;
    if (!renamed.config) return renamed;
    const config = { ...renamed.config };
    // the declarations themselves: their names, but not their starting values
    const declared = (file.config as Record<string, unknown>).variables;
    if (declared) config.variables = renameKeys(declared);
    if (config.timers) config.timers = renameKeys(config.timers);
    return { ...renamed, config };
}
