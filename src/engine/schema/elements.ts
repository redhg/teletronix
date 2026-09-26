import { z } from "zod";
import { type LinkElement, LinkSchema, linkModule } from "../../modules/link/definition.ts";
import { type TextElement, TextSchema, textModule } from "../../modules/text/definition.ts";
import type { ModuleDefinition } from "../module.ts";

// The registry of element modules. Adding a module means adding it here.
export const ElementSchema = z.discriminatedUnion("type", [TextSchema, LinkSchema]);

export type Element = TextElement | LinkElement;
export type ElementType = Element["type"];
export type ElementOf<T extends ElementType> = Extract<Element, { type: T }>;

export const modules: { [T in ElementType]: ModuleDefinition<ElementOf<T>> } = {
    text: textModule,
    link: linkModule,
};

export function moduleFor<E extends Element>(element: E): ModuleDefinition<E> {
    return modules[element.type] as ModuleDefinition<E>;
}
