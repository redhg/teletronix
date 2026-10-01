import { z } from "zod";
import { type AsciiElement, AsciiSchema, asciiModule } from "../../modules/ascii/definition.ts";
import { type BitmapElement, BitmapSchema, bitmapModule } from "../../modules/bitmap/definition.ts";
import {
    type ButtonsElement,
    ButtonsSchema,
    buttonsModule,
} from "../../modules/buttons/definition.ts";
import {
    type ChecklistElement,
    ChecklistSchema,
    checklistModule,
} from "../../modules/checklist/definition.ts";
import { type ChoiceElement, ChoiceSchema, choiceModule } from "../../modules/choice/definition.ts";
import {
    type ColumnsElement,
    columnsModule,
    createColumnsSchema,
} from "../../modules/columns/definition.ts";
import {
    type CounterElement,
    CounterSchema,
    counterModule,
} from "../../modules/counter/definition.ts";
import { type CrashElement, CrashSchema, crashModule } from "../../modules/crash/definition.ts";
import {
    type DecryptElement,
    DecryptSchema,
    decryptModule,
} from "../../modules/decrypt/definition.ts";
import {
    type HexdumpElement,
    HexdumpSchema,
    hexdumpModule,
} from "../../modules/hexdump/definition.ts";
import { type LinkElement, LinkSchema, linkModule } from "../../modules/link/definition.ts";
import { type LoginElement, LoginSchema, loginModule } from "../../modules/login/definition.ts";
import { type MenuElement, MenuSchema, menuModule } from "../../modules/menu/definition.ts";
import { type MeterElement, MeterSchema, meterModule } from "../../modules/meter/definition.ts";
import { type NumberElement, NumberSchema, numberModule } from "../../modules/number/definition.ts";
import { type PauseElement, PauseSchema, pauseModule } from "../../modules/pause/definition.ts";
import {
    type PowerOffElement,
    PowerOffSchema,
    powerOffModule,
} from "../../modules/poweroff/definition.ts";
import {
    type ProgressElement,
    ProgressSchema,
    progressModule,
} from "../../modules/progress/definition.ts";
import { type PromptElement, PromptSchema, promptModule } from "../../modules/prompt/definition.ts";
import {
    createSectionSchema,
    type SectionElement,
    sectionModule,
} from "../../modules/section/definition.ts";
import { type SliderElement, SliderSchema, sliderModule } from "../../modules/slider/definition.ts";
import {
    type SpinnerElement,
    SpinnerSchema,
    spinnerModule,
} from "../../modules/spinner/definition.ts";
import { type TableElement, TableSchema, tableModule } from "../../modules/table/definition.ts";
import { type TextElement, TextSchema, textModule } from "../../modules/text/definition.ts";
import {
    type TimerElement,
    TimerElementSchema,
    timerModule,
} from "../../modules/timer/definition.ts";
import { type ToggleElement, ToggleSchema, toggleModule } from "../../modules/toggle/definition.ts";
import { type VisualElement, VisualSchema, visualModule } from "../../modules/visual/definition.ts";
import type { ModuleDefinition } from "../module.ts";
import type { Align, LayoutOptions } from "../text/layout.ts";

/** A section's contents are elements, so its schema refers back to them (lazily). */
export const SectionSchema = createSectionSchema(() => z.array(ContentSchema));
/** Likewise for columns. */
export const ColumnsSchema = createColumnsSchema(() => z.array(ContentSchema));

// The registry of element modules. Adding a module means adding it here.
export const ElementSchema = z.discriminatedUnion("type", [
    TextSchema,
    LinkSchema,
    ToggleSchema,
    PromptSchema,
    BitmapSchema,
    ProgressSchema,
    SliderSchema,
    SectionSchema,
    PauseSchema,
    ButtonsSchema,
    NumberSchema,
    TimerElementSchema,
    ColumnsSchema,
    MeterSchema,
    TableSchema,
    ChoiceSchema,
    MenuSchema,
    AsciiSchema,
    ChecklistSchema,
    CounterSchema,
    PowerOffSchema,
    CrashSchema,
    VisualSchema,
    SpinnerSchema,
    HexdumpSchema,
    LoginSchema,
    DecryptSchema,
]);

/** An item of a screen's (or a section's) content: an element, or a string for a line of text. */
export const ContentSchema = z
    .union([z.string().meta({ description: "Shorthand for a text element" }), ElementSchema])
    .meta({
        // named, so a section's contents (which can hold sections) can refer back to it
        id: "Content",
        description: "An element, or a string: shorthand for a line of text",
    });

export type Element =
    | TextElement
    | LinkElement
    | ToggleElement
    | PromptElement
    | BitmapElement
    | ProgressElement
    | SliderElement
    | SectionElement
    | PauseElement
    | ButtonsElement
    | NumberElement
    | TimerElement
    | ColumnsElement
    | MeterElement
    | TableElement
    | ChoiceElement
    | MenuElement
    | AsciiElement
    | ChecklistElement
    | CounterElement
    | PowerOffElement
    | CrashElement
    | VisualElement
    | SpinnerElement
    | HexdumpElement
    | LoginElement
    | DecryptElement;
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
    section: sectionModule,
    pause: pauseModule,
    buttons: buttonsModule,
    number: numberModule,
    timer: timerModule,
    columns: columnsModule,
    meter: meterModule,
    table: tableModule,
    choice: choiceModule,
    menu: menuModule,
    ascii: asciiModule,
    checklist: checklistModule,
    counter: counterModule,
    "power-off": powerOffModule,
    crash: crashModule,
    visual: visualModule,
    spinner: spinnerModule,
    hexdump: hexdumpModule,
    login: loginModule,
    decrypt: decryptModule,
};

export function moduleFor<E extends Element>(element: E): ModuleDefinition<E, unknown> {
    return modules[element.type] as ModuleDefinition<E, unknown>;
}

/** The variable an element is bound to (see ModuleDefinition.binding), if any. */
export function boundVariable(element: Element): string | undefined {
    // (a meter's variable is one it shows, not one it's bound to)
    if (!moduleFor(element).binding) return undefined;
    return "variable" in element ? element.variable : undefined;
}

/** Elements whose text can be aligned, and so follow a screen's or the config's `align`. */
const ALIGNABLE = new Set<ElementType>([
    "ascii",
    "checklist",
    "choice",
    "counter",
    "decrypt",
    "text",
    "link",
    "toggle",
    "pause",
    "buttons",
    "timer",
    "table",
]);

/** How an element's text is laid out (see layoutText), given the default alignment. */
export function layoutOptions(element: Element, fallback: Align): LayoutOptions {
    if (!ALIGNABLE.has(element.type)) return {};
    return {
        // a table is laid out in columns of its own, so it's never wrapped
        wrap:
            element.type === "table" || element.type === "ascii"
                ? false
                : "wrap" in element
                  ? element.wrap
                  : true,
        align: ("align" in element ? element.align : undefined) ?? fallback,
    };
}

/**
 * Calls `visit` for every element in some content, including those inside sections, with
 * its path from the content (e.g. [2, "content", 0]).
 */
export function forEachElement(
    content: readonly Element[],
    visit: (element: Element, path: PropertyKey[]) => void,
    path: PropertyKey[] = [],
): void {
    content.forEach((element, index) => {
        visit(element, [...path, index]);
        const contents = contentsOf(element);
        if (contents) forEachElement(contents, visit, [...path, index, "content"]);
    });
}

/** The elements an element holds (a section's or columns' contents), if it holds any. */
export function contentsOf(element: Element): Element[] | undefined {
    return element.type === "section" || element.type === "columns" ? element.content : undefined;
}
