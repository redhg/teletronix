// Inline styling: [alert]CRITICAL[/alert] (or [/]) gives part of a line CSS classes. Only
// lowercase class names that are closed later count, so text like [ OK ], [FAIL] or [X] is
// left alone. [[ is a [ that's never markup: [[alert] shows as [alert].

import type { Frame, Segment } from "../reveal/types.ts";

/** Classes for the characters from `start` up to `end`, in the text without its markup. */
export interface StyleRange {
    start: number;
    end: number;
    className: string;
}

const OPEN = /\[([a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*)\]/y;
const CLOSE = /\[\/([a-z][a-z0-9-]*)?\]/y;

/**
 * Text without its markup, and where its styles go. `removed` is where the markup was, as
 * [start, end) ranges of the text with it.
 */
export function parseMarkup(text: string): {
    text: string;
    styles: StyleRange[];
    removed: [number, number][];
} {
    if (!text.includes("[")) return { text, styles: [], removed: [] };
    // which openings are closed: the tags, as [index, length, kind]
    const tags: { at: number; length: number; open?: string; close?: string; escape?: true }[] = [];
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== "[") continue;
        // [[: one of them goes, and the other is just a [
        if (text[i + 1] === "[") {
            tags.push({ at: i, length: 1, escape: true });
            i++;
            continue;
        }
        OPEN.lastIndex = i;
        const open = OPEN.exec(text);
        if (open) {
            tags.push({ at: i, length: open[0].length, open: open[1] });
            continue;
        }
        CLOSE.lastIndex = i;
        const close = CLOSE.exec(text);
        if (close) tags.push({ at: i, length: close[0].length, close: close[1] ?? "" });
    }

    // pair them up, innermost first; unpaired ones are just text
    const paired = new Set<number>();
    const stack: number[] = [];
    tags.forEach((tag, index) => {
        if (tag.escape) {
            paired.add(index);
            return;
        }
        if (tag.open !== undefined) {
            stack.push(index);
            return;
        }
        for (let s = stack.length - 1; s >= 0; s--) {
            const opening = tags[stack[s] as number];
            const name = opening?.open?.split(" ")[0];
            if (tag.close === "" || tag.close === name) {
                paired.add(stack[s] as number);
                paired.add(index);
                stack.splice(s);
                return;
            }
        }
    });
    if (paired.size === 0) return { text, styles: [], removed: [] };

    let plain = "";
    let from = 0;
    const open: { className: string; start: number }[] = [];
    const styles: StyleRange[] = [];
    const removed: [number, number][] = [];
    tags.forEach((tag, index) => {
        if (!paired.has(index)) return;
        removed.push([tag.at, tag.at + tag.length]);
        plain += text.slice(from, tag.at);
        from = tag.at + tag.length;
        if (tag.escape) return;
        if (tag.open !== undefined) {
            open.push({ className: tag.open, start: plain.length });
        } else {
            const opening = open.pop();
            if (opening && plain.length > opening.start) {
                styles.push({
                    start: opening.start,
                    end: plain.length,
                    className: opening.className,
                });
            }
        }
    });
    plain += text.slice(from);
    return { text: plain, styles, removed };
}

/** The classes at each character of a text `length` long: nested styles add up. */
export function classesAt(styles: readonly StyleRange[], length: number): string[] {
    const classes = Array.from({ length }, () => "");
    for (const style of styles) {
        for (let i = style.start; i < Math.min(style.end, length); i++) {
            classes[i] = classes[i] ? `${classes[i]} ${style.className}` : style.className;
        }
    }
    return classes;
}

/** A frame over a text, with its styles: each segment split where the classes change. */
export function applyStyles(frame: Frame, styles: readonly StyleRange[]): Frame {
    if (styles.length === 0) return frame;
    const length = frame.reduce((sum, segment) => sum + segment.text.length, 0);
    const classes = classesAt(styles, length);
    const out: Segment[] = [];
    let at = 0;
    for (const segment of frame) {
        let start = 0;
        for (let i = 1; i <= segment.text.length; i++) {
            const here = classes[at + start] ?? "";
            if (i < segment.text.length && classes[at + i] === here) continue;
            out.push({
                kind: segment.kind,
                text: segment.text.slice(start, i),
                ...(here ? { style: here } : {}),
            });
            start = i;
        }
        at += segment.text.length;
    }
    return out;
}

/**
 * A frame whose text has markup in it (e.g. a checklist's, drawn by the module itself),
 * without it, and with its styles: markup anywhere in it counts, whatever part it's in.
 */
export function styleFrame(frame: Frame): Frame {
    const whole = frame.map((segment) => segment.text).join("");
    if (!whole.includes("[")) return frame;
    const { styles, removed } = parseMarkup(whole);
    if (removed.length === 0) return frame;
    // which characters survive, so each segment keeps its own
    const kept = Array.from({ length: whole.length }, () => true);
    for (const [start, end] of removed) for (let i = start; i < end; i++) kept[i] = false;
    const plain: Segment[] = [];
    let at = 0;
    for (const segment of frame) {
        let part = "";
        for (let i = 0; i < segment.text.length; i++) {
            if (kept[at + i]) part += segment.text[i];
        }
        at += segment.text.length;
        if (part) plain.push({ kind: segment.kind, text: part });
    }
    return applyStyles(plain, styles);
}
