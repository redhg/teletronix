import type { Random } from "../random.ts";
import type { RevealOption, TransitionOption } from "../schema/common.ts";
import type { Defaults } from "../schema/program.ts";
import { createGlitchReveal } from "./glitch-reveal.ts";
import { createInstantReveal } from "./instant.ts";
import { createTeletype } from "./teletype.ts";
import type { Frame, Reveal } from "./types.ts";

export { createGlitchReveal } from "./glitch-reveal.ts";
export { splitFrame } from "./split.ts";
export type { Frame, Reveal, Segment, SegmentKind } from "./types.ts";

/** A reveal with every option filled in. */
export type RevealSpec =
    | { type: "teletype"; speed: number }
    | { type: "glitch"; duration: number }
    | { type: "instant" };

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

export const DEFAULT_FADE_DURATION = 600;

export type TransitionSpec =
    | { type: "none" }
    | { type: "glitch"; duration: number }
    | { type: "fade"; duration: number };

/** The transition used when showing a screen: its own, or the program default. */
export function resolveTransition(
    screen: TransitionOption | undefined,
    defaults: Defaults,
): TransitionSpec {
    const option = screen ?? defaults.transition;
    switch (option.type) {
        case "glitch":
            return { ...defaults.glitch, ...definedOnly(option), type: "glitch" };
        case "fade":
            return { type: "fade", duration: option.duration ?? DEFAULT_FADE_DURATION };
        case "none":
            return { type: "none" };
    }
}

export function createReveal(text: string, spec: RevealSpec, random?: Random): Reveal {
    switch (spec.type) {
        case "teletype":
            return createTeletype(text, spec);
        case "glitch":
            return createGlitchReveal(text, { duration: spec.duration, random });
        case "instant":
            return createInstantReveal(text);
    }
}

function fillOptions(option: RevealOption, defaults: Defaults): RevealSpec {
    switch (option.type) {
        case "teletype":
            return { ...defaults.teletype, ...definedOnly(option), type: "teletype" };
        case "glitch":
            return { ...defaults.glitch, ...definedOnly(option), type: "glitch" };
        case "instant":
            return { type: "instant" };
    }
}

function definedOnly<T extends object>(value: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(value).filter(([, v]) => v !== undefined),
    ) as Partial<T>;
}

/** A reveal with no text, for modules that animate something else over a fixed time. */
export function createTimedReveal(duration: number): Reveal {
    const frame: Frame = [];
    return { duration, frame: () => frame, final: () => frame };
}
