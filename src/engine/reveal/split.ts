import type { Frame, Segment } from "./types.ts";

/**
 * Splits a frame that spans several texts joined by one-character separators back into
 * one frame per text. This is how one reveal can run across a group of elements, the way
 * the original glitch effect ran across all of a page's text nodes at once.
 */
export function splitFrame(frame: Frame, lengths: readonly number[]): Frame[] {
    const frames: Segment[][] = lengths.map(() => []);
    // [start, end) of each text within the joined string
    const ranges: [number, number][] = [];
    let offset = 0;
    for (const length of lengths) {
        ranges.push([offset, offset + length]);
        offset += length + 1;
    }

    let position = 0;
    for (const segment of frame) {
        const segmentEnd = position + segment.text.length;
        ranges.forEach(([start, end], index) => {
            const from = Math.max(start, position);
            const to = Math.min(end, segmentEnd);
            if (to > from) {
                frames[index]?.push({
                    kind: segment.kind,
                    text: segment.text.slice(from - position, to - position),
                });
            }
        });
        position = segmentEnd;
    }

    return frames;
}
