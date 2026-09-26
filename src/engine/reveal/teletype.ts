import type { Frame, Reveal } from "./types.ts";

export interface TeletypeOptions {
    /** Milliseconds per character */
    speed: number;
}

/**
 * Types text one character at a time at a fixed speed. The character under the cursor
 * and the text still to come are included as segments, so the view can reserve their
 * space and nothing reflows while typing.
 *
 * Time-based rather than tick-based: several characters may appear in one animation
 * frame at high speeds, and the total duration never drifts with the frame rate.
 */
export function createTeletype(text: string, { speed }: TeletypeOptions): Reveal {
    const final: Frame = [{ kind: "visible", text }];
    // frames only change once per character, so reuse the last one between characters
    let lastIndex = -1;
    let last = final;

    return {
        duration: text.length * speed,
        final: () => final,
        frame(elapsed) {
            const index = Math.min(Math.floor(elapsed / speed), text.length);
            if (index >= text.length) return final;
            if (index !== lastIndex) {
                lastIndex = index;
                last = [
                    { kind: "visible", text: text.slice(0, index) },
                    { kind: "cursor", text: text.charAt(index) },
                    { kind: "hidden", text: text.slice(index + 1) },
                ];
            }
            return last;
        },
    };
}
