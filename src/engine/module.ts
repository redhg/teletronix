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
 */
export interface ModuleDefinition<E> {
    /** The text revealed while the element is active. Empty text completes instantly. */
    text(element: E): string;
    /** Every action the element can dispatch, so targets can be validated when parsing. */
    actions?(element: E): Action[];
}
