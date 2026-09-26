import type { RevealOption } from "../schema/common.ts";
import type { Defaults } from "../schema/program.ts";
import { createNoneReveal } from "./none.ts";
import { createTeletype } from "./teletype.ts";
import type { Reveal } from "./types.ts";

export type { Frame, Reveal, Segment, SegmentKind } from "./types.ts";

/**
 * Picks the reveal for an element: its own option, then its screen's, then the program
 * default. The chosen option's settings are layered over the defaults for that reveal type.
 */
export function createReveal(
    text: string,
    options: readonly (RevealOption | undefined)[],
    defaults: Defaults,
): Reveal {
    const option = options.find((o) => o !== undefined) ?? defaults.reveal;

    switch (option.type) {
        case "teletype":
            return createTeletype(text, { ...defaults.teletype, ...definedOnly(option) });
        case "none":
            return createNoneReveal(text);
    }
}

function definedOnly<T extends object>(value: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(value).filter(([, v]) => v !== undefined),
    ) as Partial<T>;
}
