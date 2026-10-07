import type { Program, View } from "../engine/index.ts";

/** Something the GM can show the players: an image or video in the program. */
export interface Handout {
    src: string;
    kind: "image" | "video";
    /** As the program shows it (its caption, on-screen display…), if it's a view */
    view?: View;
}

/**
 * The images and videos a program shows, for the GM to show the players at any moment: every
 * view in its actions, and the images on its screens.
 */
export function handoutsOf(program: Program): Handout[] {
    const found = new Map<string, Handout>();
    const seen = new Set<unknown>();
    const walk = (value: unknown): void => {
        if (value === null || typeof value !== "object" || seen.has(value)) return;
        seen.add(value);
        if (value instanceof Map) {
            for (const item of value.values()) walk(item);
            return;
        }
        if (Array.isArray(value)) {
            for (const item of value) walk(item);
            return;
        }
        const record = value as Record<string, unknown>;
        const view = record.view as View | undefined;
        if (view && typeof view === "object" && typeof view.src === "string") {
            if (!found.has(view.src)) found.set(view.src, { src: view.src, kind: view.kind, view });
        }
        if (
            (record.type === "bitmap" || record.type === "ascii") &&
            typeof record.src === "string" &&
            !found.has(record.src)
        ) {
            found.set(record.src, { src: record.src, kind: "image" });
        }
        for (const item of Object.values(record)) walk(item);
    };
    walk([...program.screens.values(), ...program.dialogs.values()]);
    return [...found.values()];
}
