import { z } from "zod";
import { classesAt, parseMarkup } from "../text/markup.ts";
import { type Action, ActionSchema } from "./common.ts";

// ─── Header and status bars ──────────────────────────────────────────────────
// Lines pinned to the top and bottom of the window. They don't scroll or reveal, stay put
// between screens, and show variables as they change.

export const BarLinkSchema = z
    .strictObject({
        text: z.string().min(1).meta({ description: "The link's text" }),
        action: ActionSchema.meta({ description: "What happens when it's clicked" }),
        className: z
            .string()
            .optional()
            .meta({ description: 'Space-separated CSS classes, e.g. "alert"' }),
    })
    .meta({ description: "A link in a bar, usable at any time" });

export const BarSlotSchema = z
    .union([z.string().meta({ description: "Text" }), BarLinkSchema])
    .transform((slot): BarSlot => (typeof slot === "string" ? { text: slot } : slot))
    .meta({
        description:
            'Text, which can show variables ("{credits}"), or a link: { "text", "action" }',
    });

export const BarLineObjectSchema = z
    .strictObject({
        left: BarSlotSchema.optional().meta({ description: "At the left edge" }),
        center: BarSlotSchema.optional().meta({ description: "In the middle" }),
        right: BarSlotSchema.optional().meta({ description: "At the right edge" }),
        className: z
            .string()
            .optional()
            .meta({
                description:
                    'Space-separated CSS classes for the line, e.g. "plain" for normal text ' +
                    "instead of the bar's inverse video",
            }),
    })
    .meta({ description: "A bar line with text or links at its left, middle and right" });

export const BarLineSchema = z
    .union([z.string(), BarLineObjectSchema])
    .transform((line): BarLine => (typeof line === "string" ? { left: { text: line } } : line))
    .meta({
        description:
            'A line: text, or { "left", "center", "right" } for up to three things spread across it',
    });

export const BarSchema = z
    .array(BarLineSchema)
    .min(1)
    .meta({
        description:
            "Lines pinned to the edge of the window, in inverse video: they don't scroll, stay " +
            "put between screens, and show variables as they change",
    });

export interface BarSlot {
    text: string;
    action?: Action;
    className?: string;
}

export interface BarLine {
    left?: BarSlot;
    center?: BarSlot;
    right?: BarSlot;
    className?: string;
}

export type SlotName = "left" | "center" | "right";

/** A run of a bar line's text: part of a slot, or the space between slots. */
export interface BarPiece {
    text: string;
    slot?: SlotName;
    /** CSS classes from inline markup, e.g. [alert]...[/] */
    style?: string;
}

/**
 * Lays a bar line out in `columns`: left at the left edge, right at the right edge, center
 * in the middle. Where they'd overlap, the left wins, then the right. `format` fills in
 * variables.
 */
export function layoutBarLine(
    line: BarLine,
    columns: number,
    format: (text: string) => string,
): BarPiece[] {
    const cells: { char: string; slot?: SlotName; style?: string }[] = Array.from(
        { length: columns },
        () => ({ char: " " }),
    );
    const place = (slot: SlotName, start: (length: number) => number) => {
        // (laid out by the text it shows, without its markup)
        const { text, styles } = parseMarkup(line[slot] ? format(line[slot].text) : "");
        const classes = classesAt(styles, text.length);
        const from = Math.max(0, start(text.length));
        for (let i = 0; i < text.length && from + i < columns; i++) {
            const cell = cells[from + i];
            if (cell && !cell.slot) {
                Object.assign(cell, {
                    char: text[i],
                    slot,
                    ...(classes[i] ? { style: classes[i] } : {}),
                });
            }
        }
    };
    place("left", () => 0);
    place("right", (length) => columns - length);
    place("center", (length) => Math.floor((columns - length) / 2));

    const pieces: BarPiece[] = [];
    for (const cell of cells) {
        const last = pieces.at(-1);
        if (last && last.slot === cell.slot && last.style === cell.style) last.text += cell.char;
        else {
            pieces.push({
                text: cell.char,
                ...(cell.slot ? { slot: cell.slot } : {}),
                ...(cell.style ? { style: cell.style } : {}),
            });
        }
    }
    return pieces;
}

/** Every action in a bar's links, with where it is, for checking. */
export function barActions(bar: readonly BarLine[]): { path: PropertyKey[]; action: Action }[] {
    return bar.flatMap((line, index) =>
        (["left", "center", "right"] as const).flatMap((slot) => {
            const action = line[slot]?.action;
            return action ? [{ path: [index, slot, "action"], action }] : [];
        }),
    );
}
