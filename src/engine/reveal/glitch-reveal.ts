import type { Random } from "../random.ts";
import { createGlitch } from "./glitch.ts";
import type { Frame, Reveal } from "./types.ts";

export interface GlitchRevealOptions {
    /** Total time in ms */
    duration: number;
    /** Erase instead of reveal. */
    reverse?: boolean;
    random?: Random;
}

/** Runs {@link createGlitch} over a fixed duration. */
export function createGlitchReveal(text: string, options: GlitchRevealOptions): Reveal {
    const { duration, reverse = false, random } = options;
    const glitch = createGlitch(text, { reverse, random });
    const final: Frame = [{ kind: "visible", text: reverse ? glitch(1) : text }];
    let last: Frame = [];

    return {
        duration,
        final: () => final,
        frame(elapsed) {
            const next = glitch(Math.min(elapsed / duration, 1));
            if (next !== last[0]?.text) last = [{ kind: "visible", text: next }];
            return last;
        },
    };
}
