import { describe, expect, it } from "vitest";
import { seededRandom } from "../random.ts";
import { createGlitch } from "./glitch.ts";
import { createGlitchReveal } from "./glitch-reveal.ts";

const NBSP = " ";
const GLITCH_CHARS = "—~±§|[].+$^@*()•x%!?#";
const TEXT = "The quick brown fox\njumps over the lazy dog";
const BLANK = TEXT.replace(/[^ \n]/g, NBSP);

/** Never sprinkles glyphs (the 50% roll always fails). */
const quiet = () => 0.99;
/** Always sprinkles, always picks junk, always the first glyph. */
const noisy = () => 0;

/** Runs a glitch from start to end in `steps` frames. */
const run = (text: string, options: Parameters<typeof createGlitch>[1], steps = 60) => {
    const glitch = createGlitch(text, options);
    return Array.from({ length: steps + 1 }, (_, i) => glitch(i / steps));
};

describe("createGlitch", () => {
    it("starts blank and ends with the text", () => {
        const glitch = createGlitch(TEXT, { random: quiet });
        expect(glitch(0)).toBe(BLANK);
        expect(glitch(1)).toBe(TEXT);
    });

    it("erases from the text to blank in reverse", () => {
        const glitch = createGlitch(TEXT, { reverse: true, random: quiet });
        expect(glitch(0)).toBe(TEXT);
        expect(glitch(1)).toBe(BLANK);
    });

    it("keeps every frame the same length, with gaps in place", () => {
        for (const reverse of [false, true]) {
            for (const frame of run(TEXT, { reverse, random: seededRandom(1) })) {
                expect(frame).toHaveLength(TEXT.length);
                for (const [i, char] of Array.from(TEXT).entries()) {
                    if (char === " " || char === "\n") expect(frame[i]).toBe(char);
                }
            }
        }
    });

    it("reveals left to right with eased timing", () => {
        const text = "a".repeat(40);
        const glitch = createGlitch(text, { random: quiet });
        // sine in-out squared is 0.25 at the midpoint, a hair under in floating point
        expect(glitch(0.5)).toBe("a".repeat(9) + NBSP.repeat(31));

        let revealed = 0;
        for (const frame of run(text, { random: quiet })) {
            const count = frame.indexOf(NBSP) === -1 ? 40 : frame.indexOf(NBSP);
            expect(count).toBeGreaterThanOrEqual(revealed);
            revealed = count;
        }
    });

    it("sprinkles glyphs across a zone ahead of the cursor, denser near it", () => {
        const text = "a".repeat(40);
        // cursor 9, zone 30; 20 samples at cursor + floor(60 * k/20), i.e. every 3rd slot
        const frame = createGlitch(text, { random: noisy })(0.5);
        const zone = Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? "—" : NBSP)).join("");
        expect(frame).toBe("a".repeat(9) + zone + NBSP);
    });

    it("only uses glitch glyphs forward and only 'x' in reverse", () => {
        const allowed = (extra: string) => new Set([...TEXT, NBSP, ...extra]);
        const forward = allowed(GLITCH_CHARS);
        const reverse = allowed("x");

        const forwardFrames = run(TEXT, { random: seededRandom(7) });
        const reverseFrames = run(TEXT, { reverse: true, random: seededRandom(7) });
        for (const frame of forwardFrames) for (const c of frame) expect(forward.has(c)).toBe(true);
        for (const frame of reverseFrames) for (const c of frame) expect(reverse.has(c)).toBe(true);

        // and the effect actually shows up
        expect(forwardFrames.some((f) => [...f].some((c) => GLITCH_CHARS.includes(c)))).toBe(true);
        expect(reverseFrames.some((f) => f.includes("x"))).toBe(true);
    });

    it("is deterministic for a given seed", () => {
        expect(run(TEXT, { random: seededRandom(42) })).toEqual(
            run(TEXT, { random: seededRandom(42) }),
        );
        expect(run(TEXT, { random: seededRandom(42) })).not.toEqual(
            run(TEXT, { random: seededRandom(43) }),
        );
    });
});

describe("createGlitchReveal", () => {
    it("runs for its duration and ends revealed, or blank in reverse", () => {
        const reveal = createGlitchReveal("hello", { duration: 500, random: quiet });
        expect(reveal.duration).toBe(500);
        expect(reveal.final()).toEqual([{ kind: "visible", text: "hello" }]);

        const erase = createGlitchReveal("hello", { duration: 500, reverse: true });
        expect(erase.final()).toEqual([{ kind: "visible", text: NBSP.repeat(5) }]);
    });

    it("reuses the frame while the text doesn't change", () => {
        const reveal = createGlitchReveal("hello", { duration: 500, random: quiet });
        expect(reveal.frame(0)).toBe(reveal.frame(1));
    });
});
