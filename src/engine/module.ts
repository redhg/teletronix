import type { Random } from "./random.ts";
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
     * A custom reveal, for elements that aren't simply revealed text (e.g. images, progress
     * bars). Its frames may change the element's text as they go; views can also follow it
     * with ScreenRun.subscribeProgress(). Elements with one never join a glitch block.
     */
    reveal?(element: E, spec: RevealSpec, context: RevealContext): Reveal;
    /**
     * What happens once the element has finished revealing, given the reveal that ran. An
     * outcome holds the rest of the screen until its action runs; if the action opens a
     * dialog, the screen then carries on behind it.
     */
    outcome?(element: E, reveal: Reveal): Outcome | undefined;
    /** Whether a key press (a KeyboardEvent.key) should interrupt the element while it reveals. */
    interruptKey?(element: E, key: string): boolean;
    /**
     * Called when the element's memory changes (e.g. a slider moves). Returns an action to
     * run, if the change should trigger one.
     */
    changed?(element: E, before: M | undefined, after: M): Action | undefined;
}

export interface RevealContext {
    /** Characters per line, which can change while the reveal runs. */
    columns: () => number;
    random?: Random;
    /** The element's current memory (see ModuleDefinition), which can change while it shows. */
    memory: () => unknown;
}

export interface Outcome {
    action: Action;
    /** Milliseconds to wait before the action runs. */
    after: number;
}
