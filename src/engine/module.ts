import type { Reveal, RevealSpec } from "./reveal/index.ts";
import type { Action } from "./schema/common.ts";

/** Every element gets a stable id when a program is parsed: `<screenId>#<index>`. */
export interface ElementIdentity {
    id: string;
}

/**
 * The framework-free half of a module. The other half is its view in `src/modules/<name>/`.
 *
 * To add a module: create `src/modules/<name>/definition.ts` exporting a Zod schema and a
 * definition, register both in `src/engine/schema/elements.ts`, then add a view to the
 * UI registry (which is typed so a missing view fails to compile).
 *
 * `M` is the element's memory: state the terminal keeps for it across screen visits, such
 * as a toggle's current position.
 */
export interface ModuleDefinition<E, M = never> {
    /** The element's text: what's revealed while active, and shown once done. */
    text(element: E, memory: M | undefined): string;
    /** Every action the element can dispatch, so targets can be validated when parsing. */
    actions?(element: E): Action[];
    /**
     * A custom reveal, for elements that aren't revealed as text (e.g. images). Views follow
     * it with ScreenRun.subscribeProgress(). Elements with one never join a glitch block.
     */
    reveal?(element: E, spec: RevealSpec): Reveal;
}
