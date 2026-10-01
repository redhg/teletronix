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

export const BarBreadcrumbSchema = z
    .strictObject({
        breadcrumb: z.literal(true).meta({ description: "A breadcrumb here" }),
        separator: z.string().default(" › ").meta({
            description: 'What goes between the steps (default: " › ")',
        }),
        className: z
            .string()
            .optional()
            .meta({ description: 'Space-separated CSS classes, e.g. "alert"' }),
    })
    .meta({
        description:
            "Where the player is, following screens' parents: HOME › READOUTS › SPINNERS, each " +
            "step a link but the last. A long one loses steps from the left.",
    });

export const BarSlotSchema = z
    .union([z.string().meta({ description: "Text" }), BarLinkSchema, BarBreadcrumbSchema])
    .transform((slot): BarSlot => {
        if (typeof slot === "string") return { text: slot };
        if ("breadcrumb" in slot) {
            return {
                text: "",
                breadcrumb: { separator: slot.separator },
                className: slot.className,
            };
        }
        return slot;
    })
    .meta({
        description:
            'Text, which can show variables ("{credits}"), a link: { "text", "action" }, or ' +
            '{ "breadcrumb": true }',
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
    /** A breadcrumb in place of text (see BarBreadcrumbSchema) */
    breadcrumb?: { separator: string };
}

/** A step of a breadcrumb in a bar: its name, and where it goes (none for the last). */
export interface BarCrumb {
    text: string;
    action?: Action;
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
    /** For a breadcrumb's step: where it goes */
    action?: Action;
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
    /** The breadcrumb, for a breadcrumb slot: from the top down to the current screen. */
    trail: readonly BarCrumb[] = [],
): BarPiece[] {
    const cells: { char: string; slot?: SlotName; style?: string; crumb?: number }[] = Array.from(
        { length: columns },
        () => ({ char: " " }),
    );
    // a breadcrumb: its steps, each cell remembering which step it's part of
    const placeCrumbs = (slot: SlotName, separator: string, start: (length: number) => number) => {
        let steps = trail.map((crumb, index) => ({ text: format(crumb.text), crumb: index }));
        const width = () =>
            steps.reduce((sum, step) => sum + step.text.length, 0) +
            separator.length * Math.max(0, steps.length - 1);
        // it has the room the other slots leave, with a space beside each
        const room =
            columns -
            (["left", "center", "right"] as const)
                .filter((other) => other !== slot && line[other] && !line[other].breadcrumb)
                .reduce(
                    (sum, other) =>
                        sum + parseMarkup(format(line[other]?.text ?? "")).text.length + 1,
                    0,
                );
        // too long: steps go from the left, with "…" where they were
        while (steps.length > 1 && width() > room) {
            const rest = steps.slice(steps[0]?.crumb === -1 ? 2 : 1);
            steps = rest.length > 1 ? [{ text: "…", crumb: -1 }, ...rest] : rest;
        }
        let at = Math.max(0, start(width()));
        steps.forEach((step, k) => {
            const text = k === 0 ? step.text : separator + step.text;
            const skip = k === 0 ? 0 : separator.length;
            for (let i = 0; i < text.length && at < columns; i++, at++) {
                const cell = cells[at];
                if (cell && !cell.slot) {
                    Object.assign(cell, {
                        char: text[i],
                        slot,
                        ...(i >= skip && step.crumb >= 0 ? { crumb: step.crumb } : {}),
                    });
                }
            }
        });
    };
    const place = (slot: SlotName, start: (length: number) => number) => {
        const content = line[slot];
        if (content?.breadcrumb) return placeCrumbs(slot, content.breadcrumb.separator, start);
        // (laid out by the text it shows, without its markup)
        const { text, styles } = parseMarkup(content ? format(content.text) : "");
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
    let lastCrumb: number | undefined;
    for (const cell of cells) {
        const last = pieces.at(-1);
        // (a breadcrumb's steps are pieces of their own, where they're links)
        const action = cell.crumb === undefined ? undefined : trail[cell.crumb]?.action;
        const lastAction = lastCrumb === undefined ? undefined : trail[lastCrumb]?.action;
        if (
            last &&
            last.slot === cell.slot &&
            last.style === cell.style &&
            (lastCrumb === cell.crumb || (!action && !lastAction))
        ) {
            last.text += cell.char;
        } else {
            pieces.push({
                text: cell.char,
                ...(cell.slot ? { slot: cell.slot } : {}),
                ...(cell.style ? { style: cell.style } : {}),
                ...(action ? { action } : {}),
            });
        }
        lastCrumb = cell.crumb;
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
