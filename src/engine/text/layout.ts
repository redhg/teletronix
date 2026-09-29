import type { Frame, Segment } from "../reveal/types.ts";
import { applyBreaks, type Break, lineBreaks } from "./breaks.ts";

/** Where an element's text sits across the screen's columns. */
export type Align = "left" | "center" | "right";

export interface LayoutOptions {
    /** Wrap long lines to the columns (default), or keep lines as written. */
    wrap?: boolean;
    align?: Align;
}

/** How an element's text is laid out in the screen's columns. */
export interface Layout {
    breaks: Break[];
    /** Columns of space before every line, for centered or right-aligned text. */
    indent: number;
}

/**
 * Lays text out in `columns`: its line breaks, and how far it's indented. Centered and
 * right-aligned text moves as one block, so its lines keep their shape (e.g. ASCII art):
 * the widest line decides the indent for every line. A block too wide for the columns
 * starts at the left, and is cut off at the right edge by the view.
 */
export function layoutText(text: string, columns: number, options: LayoutOptions = {}): Layout {
    const breaks = options.wrap === false ? [] : lineBreaks(text, columns);
    const align = options.align ?? "left";
    if (align === "left") return { breaks, indent: 0 };

    const wrapped = applyBreaks([{ kind: "visible", text }], breaks)[0]?.text ?? "";
    const widest = Math.max(...wrapped.split("\n").map((line) => line.length));
    const room = Math.max(0, columns - widest);
    return { breaks, indent: align === "center" ? Math.floor(room / 2) : room };
}

/** Applies a layout to a frame whose segments span the source text. */
export function applyLayout(frame: Frame, layout: Layout): Frame {
    return applyIndent(applyBreaks(frame, layout.breaks), layout.indent);
}

/**
 * Puts `indent` spaces at the start of every line. They're never part of the cursor: a
 * cursor at the start of a line gets its indent just before it.
 */
function applyIndent(frame: Frame, indent: number): Frame {
    if (indent <= 0) return frame;
    const pad = " ".repeat(indent);
    const out: Segment[] = [];
    let lineStart = true;

    for (const segment of frame) {
        let text = "";
        for (const char of segment.text) {
            if (lineStart && segment.kind === "cursor") {
                const before = out.at(-1);
                if (before?.kind === "visible")
                    out[out.length - 1] = { ...before, text: before.text + pad };
                else out.push({ kind: "visible", text: pad });
            } else if (lineStart) {
                text += pad;
            }
            text += char;
            lineStart = char === "\n";
        }
        out.push({ kind: segment.kind, text });
    }
    return out;
}
