import type { Random } from "../random.ts";
import type { RevealOption, TransitionOption } from "../schema/common.ts";
import type { Defaults } from "../schema/program.ts";
import { createGlitchReveal } from "./glitch-reveal.ts";
import { createNoneReveal } from "./none.ts";
import { createTeletype } from "./teletype.ts";
import type { Reveal } from "./types.ts";

export { createGlitchReveal } from "./glitch-reveal.ts";
export { splitFrame } from "./split.ts";
export type { Frame, Reveal, Segment, SegmentKind } from "./types.ts";

/** A reveal with every option filled in. */
export type RevealSpec =
    | { type: "teletype"; speed: number }
    | { type: "glitch"; duration: number }
    | { type: "none" };

export interface ResolvedReveal {
    spec: RevealSpec;
    /** True when the element didn't set a reveal itself and got it from its screen or the config. */
    inherited: boolean;
}

/**
 * Picks the reveal for an element: its own option, then its screen's, then the program
 * default. The chosen option's settings are layered over the defaults for that reveal type.
 */
export function resolveReveal(
    own: RevealOption | undefined,
    screen: RevealOption | undefined,
    defaults: Defaults,
): ResolvedReveal {
    const option = own ?? screen ?? defaults.reveal;
    return { spec: fillOptions(option, defaults), inherited: own === undefined };
}

export type TransitionSpec = { type: "cut" } | { type: "glitch"; duration: number };

/** The transition used when showing a screen: its own, or the program default. */
export function resolveTransition(
    screen: TransitionOption | undefined,
    defaults: Defaults,
): TransitionSpec {
    const option = screen ?? defaults.transition;
    return option.type === "glitch"
        ? { ...defaults.glitch, ...definedOnly(option), type: "glitch" }
        : { type: "cut" };
}

export function createReveal(text: string, spec: RevealSpec, random?: Random): Reveal {
    switch (spec.type) {
        case "teletype":
            return createTeletype(text, spec);
        case "glitch":
            return createGlitchReveal(text, { duration: spec.duration, random });
        case "none":
            return createNoneReveal(text);
    }
}

function fillOptions(option: RevealOption, defaults: Defaults): RevealSpec {
    switch (option.type) {
        case "teletype":
            return { ...defaults.teletype, ...definedOnly(option), type: "teletype" };
        case "glitch":
            return { ...defaults.glitch, ...definedOnly(option), type: "glitch" };
        case "none":
            return { type: "none" };
    }
}

function definedOnly<T extends object>(value: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(value).filter(([, v]) => v !== undefined),
    ) as Partial<T>;
}
