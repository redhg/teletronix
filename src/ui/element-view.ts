import type { ComponentType } from "react";
import type { Element, ElementState, ScreenRun } from "../engine/index.ts";

export interface ElementViewProps<E extends Element> {
    element: E;
    state: ElementState;
    /**
     * Whether the element can be used: it's been revealed and, if the screen waits for its
     * whole reveal (waitForReveal), so has the rest of it.
     */
    interactive: boolean;
    run: ScreenRun;
    index: number;
}

export function classNames(...names: (string | false | null | undefined)[]): string {
    return names.filter(Boolean).join(" ");
}

export type ElementView<E extends Element> = ComponentType<ElementViewProps<E>>;
