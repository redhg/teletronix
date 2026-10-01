import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";
import type { Element } from "../../engine/schema/elements.ts";
import { VariableNameSchema } from "../../engine/schema/variables.ts";
import type { RawContent } from "../section/definition.ts";

/**
 * The carousel schema, given the schema for its slides' contents (elements, which can hold
 * carousels), built by the element registry to keep this module out of an import cycle.
 */
export const createCarouselSchema = (content: () => z.ZodType<RawContent[], RawContent[]>) =>
    z
        .strictObject({
            type: z.literal("carousel"),
            slides: z
                .array(z.lazy(content))
                .min(1)
                .meta({
                    description:
                        "The slides, each a list of elements like a screen's content: images, " +
                        "text, tables, links… Each reveals as it comes into view.",
                }),
            start: z.int().min(1).default(1).meta({
                description: "The slide to show first, from 1 (default: 1)",
            }),
            loop: z.boolean().default(false).meta({
                description: "Go from the last slide round to the first, and back (default: false)",
            }),
            autoplay: z
                .int()
                .min(500)
                .optional()
                .meta({
                    description:
                        "Moves on by itself, this many milliseconds after each slide has " +
                        "revealed, until the player flips a slide themselves",
                }),
            prev: z.string().default("◄ PREV").meta({
                description: 'The link to the slide before (default: "◄ PREV")',
            }),
            next: z.string().default("NEXT ►").meta({
                description: 'The link to the slide after (default: "NEXT ►")',
            }),
            counter: z
                .union([z.string(), z.literal(false)])
                .default("{slide}/{slides}")
                .meta({
                    description:
                        'Between the links: which slide this is, "{slide}" of "{slides}" ' +
                        '(default: "{slide}/{slides}"), or false for none',
                }),
            variable: VariableNameSchema.optional().meta({
                description:
                    "A number variable that holds the slide showing, from 1, e.g. to show a link " +
                    "once the last has been seen. Setting it flips the carousel.",
            }),
            ...ElementBaseShape,
        })
        .meta({
            description:
                "Slides shown one at a time, like records on a terminal: flipped with its ◄ PREV " +
                "and NEXT ► links or the ← and → keys. It remembers which slide was showing when " +
                "you come back.",
        });

export type CarouselElement = Omit<z.output<ReturnType<typeof createCarouselSchema>>, "slides"> &
    ElementIdentity & { slides: Element[][] };

/** A carousel's memory is the slide showing, from 0. */
export type CarouselMemory = number;

/** The slide showing, from 0. */
export function currentSlide(
    carousel: CarouselElement,
    memory: CarouselMemory | undefined,
): number {
    const slide = memory ?? carousel.start - 1;
    return Math.min(Math.max(0, Math.round(slide)), carousel.slides.length - 1);
}

/** The slide `step` slides from this one (1 on, -1 back), or null at an end without a loop. */
export function stepSlide(carousel: CarouselElement, slide: number, step: number): number | null {
    const count = carousel.slides.length;
    const to = slide + step;
    if (carousel.loop) return ((to % count) + count) % count;
    return to < 0 || to >= count ? null : to;
}

/** The counter's text, e.g. "2/5". */
export function counterText(carousel: CarouselElement, slide: number): string {
    if (carousel.counter === false) return "";
    return carousel.counter
        .replaceAll("{slide}", String(slide + 1))
        .replaceAll("{slides}", String(carousel.slides.length));
}

export const carouselModule: ModuleDefinition<CarouselElement, CarouselMemory> = {
    // nothing of its own to reveal: its slide is revealed, then its controls show
    text: () => "",
    binding: {
        check(carousel, initial) {
            if (typeof initial !== "number") return "A carousel can only be bound to a number";
            return initial >= 1 && initial <= carousel.slides.length
                ? null
                : `The variable must start between 1 and ${carousel.slides.length}`;
        },
        read: (carousel, value) => currentSlide(carousel, (Number(value) || 1) - 1),
        write: (_carousel, memory) => memory + 1,
    },
};
