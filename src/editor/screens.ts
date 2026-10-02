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
