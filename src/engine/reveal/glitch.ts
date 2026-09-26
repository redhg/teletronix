// Glitch text effect, ported from the page transition on musicforprogramming.net
// (https://musicforprogramming.net). All credit for the effect's design goes to its authors.
//
// The original is a Svelte transition that collects a DOM node's text nodes, then on
// every tick writes a mix of real text, random glyphs and blanks back into them. This
// port keeps the per-tick logic as it was and drops the DOM handling: it maps a string
// and a progress value to the string to display.

import type { Random } from "../random.ts";

const NBSP = " ";
const GLITCH_CHARS = "—~±§|[].+$^@*()•x%!?#";

/** Characters that are never glitched, so word gaps and line breaks stay put. */
const isGap = (char: string | undefined) => char === " " || char === "\n";

export interface GlitchOptions {
    /** Erase the text instead of revealing it. */
    reverse?: boolean;
    random?: Random;
}

/**
 * Creates a glitch animation for `text`. The returned function gives the string to show at
 * progress `t` (0 = start, 1 = end); every string has the same length as `text`.
 *
 * Forward, the text is revealed left to right: real text up to a cursor, then a zone of
 * random glyphs (with occasional sneak previews of the real text), then blanks. In
 * reverse, the text is erased left to right, leaving a short trail of "x" glyphs.
 *
 * The function is stateful: glyphs accumulate in a buffer across calls so they linger and
 * flicker, which is what makes the effect. Call it with non-decreasing `t`, once per frame.
 */
export function createGlitch(text: string, options: GlitchOptions = {}): (t: number) => string {
    const { reverse = false, random = Math.random } = options;

    // Same length as the text, but every letter becomes NBSP while gaps stay as they are.
    // With a monospace font this keeps the layout identical while "invisible", and lets the
    // code tell gaps apart from letter slots. (The original only kept spaces, because it
    // stripped line breaks from its text; this text may contain them.)
    const blankText = Array.from(text, (char) => (isGap(char) ? char : NBSP)).join("");

    // Persistent glitch buffer: it accumulates random glyphs across frames, so glitches
    // linger and flicker instead of being re-rolled every frame.
    let glitchBuf = blankText;

    // Max width of the glitch zone. Forward it's 1.5x the whole text, so mid-animation
    // glyphs are sprinkled well ahead of the cursor.
    const maxZone = Math.floor(text.length * (reverse ? 0.25 : 1.5));

    // random() > realThreshold writes the REAL character into the buffer.
    // Forward: 20% real (sneak previews), 80% junk. Reverse: 90% real, 10% "x".
    const realThreshold = reverse ? 0.1 : 0.8;
    const randomGlyph = () =>
        reverse ? "x" : (GLITCH_CHARS[Math.floor(random() * GLITCH_CHARS.length)] ?? "x");

    return (progress) => {
        // The original ran t from 1 to 0 when erasing (Svelte's "out" direction). Its end
        // state was never shown, because Svelte removed the node, so return it explicitly.
        if (progress >= 1) return reverse ? blankText : text;
        let t = reverse ? 1 - progress : progress;

        // Easing: sine in-out, then squared: slow start, fast finish.
        t = -(Math.cos(Math.PI * t) - 1) / 2;
        t = t ** 2;
        // Flipping means the erase also sweeps left to right.
        if (reverse) t = 1 - t;

        const cursor = Math.floor(text.length * t);
        // The glitch zone is a triangle: 0 at the start and end, maxZone at t = 0.5.
        const zone = Math.floor(2 * (0.5 - Math.abs(t - 0.5)) * maxZone);

        // On ~50% of frames, sprinkle 20 new glyphs ahead of the cursor. The k/20 factor
        // biases them toward the cursor: dense near it, sparse far away.
        if (random() < 0.5 && t < 1 && t !== 0) {
            for (let k = 0; k < 20; k++) {
                const pos = cursor + Math.floor((1 - random()) * maxZone * (k / 20));
                if (!isGap(glitchBuf[pos])) {
                    glitchBuf = replaceAt(
                        glitchBuf,
                        pos,
                        random() > realThreshold ? (text[pos] ?? "") : randomGlyph(),
                    );
                }
            }
        }

        if (reverse) {
            // [ blank ....... | glitch trail | real text still to be erased ]
            const trailStart = Math.max(cursor - 1 - zone, 0);
            const trailEnd = Math.max(cursor - 1, 0);
            return (
                blankText.slice(0, trailStart) +
                glitchBuf.slice(trailStart, trailEnd) +
                text.slice(trailEnd)
            );
        }

        // [ real text typed so far | glitch zone | blank ....... ]
        return (
            text.slice(0, cursor) +
            glitchBuf.slice(cursor, cursor + zone) +
            blankText.slice(cursor + zone)
        );
    };
}

function replaceAt(str: string, index: number, char: string): string {
    if (index > str.length - 1 || index < 0) return str;
    return str.substring(0, index) + char + str.substring(index + 1);
}
