import type { ComponentType } from "react";
import type { Element, ElementState, ScreenRun } from "../engine/index.ts";

export interface ElementViewProps<E extends Element> {
    element: E;
    state: ElementState;
    run: ScreenRun;
    index: number;
}

export function classNames(...names: (string | false | null | undefined)[]): string {
    return names.filter(Boolean).join(" ");
}

export type ElementView<E extends Element> = ComponentType<ElementViewProps<E>>;
