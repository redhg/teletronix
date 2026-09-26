import { z } from "zod";
import { type BitmapElement, BitmapSchema, bitmapModule } from "../../modules/bitmap/definition.ts";
import { type LinkElement, LinkSchema, linkModule } from "../../modules/link/definition.ts";
import {
    type ProgressElement,
    ProgressSchema,
    progressModule,
} from "../../modules/progress/definition.ts";
import { type PromptElement, PromptSchema, promptModule } from "../../modules/prompt/definition.ts";
import { type SliderElement, SliderSchema, sliderModule } from "../../modules/slider/definition.ts";
import { type TextElement, TextSchema, textModule } from "../../modules/text/definition.ts";
import { type ToggleElement, ToggleSchema, toggleModule } from "../../modules/toggle/definition.ts";
import type { ModuleDefinition } from "../module.ts";

// The registry of element modules. Adding a module means adding it here.
export const ElementSchema = z.discriminatedUnion("type", [
    TextSchema,
    LinkSchema,
    ToggleSchema,
    PromptSchema,
    BitmapSchema,
    ProgressSchema,
    SliderSchema,
]);

export type Element =
    | TextElement
    | LinkElement
    | ToggleElement
    | PromptElement
    | BitmapElement
    | ProgressElement
    | SliderElement;
export type ElementType = Element["type"];
export type ElementOf<T extends ElementType> = Extract<Element, { type: T }>;

export const modules: { [T in ElementType]: ModuleDefinition<ElementOf<T>, unknown> } = {
    text: textModule,
    link: linkModule,
    toggle: toggleModule,
    prompt: promptModule,
    bitmap: bitmapModule,
    progress: progressModule,
    slider: sliderModule,
};

export function moduleFor<E extends Element>(element: E): ModuleDefinition<E, unknown> {
    return modules[element.type] as ModuleDefinition<E, unknown>;
}

/** The variable an element is bound to (see ModuleDefinition.binding), if any. */
export function boundVariable(element: Element): string | undefined {
    return "variable" in element ? element.variable : undefined;
}
