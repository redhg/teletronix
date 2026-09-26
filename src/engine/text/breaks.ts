import type { Frame } from "../reveal/types.ts";

/**
 * A soft line break. `space` breaks replace the space at `at` with a newline; hard
 * breaks (for words longer than a line) insert a newline before `at`.
 */
export interface Break {
    at: number;
    space: boolean;
}

/**
 * Greedy word wrap for monospace text. Existing newlines are respected.
 *
 * Breaks are computed from the source text, never from a frame, so glitch glyphs and
 * blanks can't move a line break mid-animation.
 */
export function lineBreaks(text: string, columns: number): Break[] {
    if (!Number.isFinite(columns) || columns < 1) return [];

    const breaks: Break[] = [];
    let lineStart = 0;

    while (lineStart <= text.length) {
        const newline = text.indexOf("\n", lineStart);
        const lineEnd = newline === -1 ? text.length : newline;

        let pos = lineStart;
        while (lineEnd - pos > columns) {
            const space = text.lastIndexOf(" ", pos + columns);
            if (space > pos) {
                breaks.push({ at: space, space: true });
                pos = space + 1;
            } else {
                breaks.push({ at: pos + columns, space: false });
                pos += columns;
            }
        }

        if (newline === -1) break;
        lineStart = newline + 1;
    }

    return breaks;
}

/** Applies line breaks to a frame whose segments span the source text. */
export function applyBreaks(frame: Frame, breaks: readonly Break[]): Frame {
    if (breaks.length === 0) return frame;

    let offset = 0;
    let next = 0;

    return frame.map((segment) => {
        const end = offset + segment.text.length;
        let text = "";
        let cursor = offset;

        while (next < breaks.length) {
            const br = breaks[next] as Break;
            // a break at a segment boundary belongs to the segment that starts there
            if (br.at >= end) break;
            text += segment.text.slice(cursor - offset, br.at - offset);
            text += "\n";
            cursor = br.space ? br.at + 1 : br.at;
            next++;
        }

        text += segment.text.slice(cursor - offset);
        offset = end;
        return { kind: segment.kind, text };
    });
}
