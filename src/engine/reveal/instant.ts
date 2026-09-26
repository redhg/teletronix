import type { Frame, Reveal } from "./types.ts";

/** Shows the whole text at once. */
export function createInstantReveal(text: string): Reveal {
    const final: Frame = [{ kind: "visible", text }];
    return { duration: 0, frame: () => final, final: () => final };
}
