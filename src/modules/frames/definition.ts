import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";
import type { Element } from "../../engine/schema/elements.ts";
import type { RawContent } from "../section/definition.ts";

/** Characters a border takes from a frame's width: a line and a space each side. */
export const BORDER_WIDTH = 4;

/**
 * A frame's schema, given the schema for its contents (elements, which can hold frames),
 * built by the element registry to keep this module out of an import cycle with it.
 */
export const createFrameSchema = (content: () => z.ZodType<RawContent[], RawContent[]>) =>
    z
        .strictObject({
            title: z.string().optional().meta({
                description: 'Set into the top of its border, e.g. "SYSTEM LOG"',
            }),
            rows: z.int().min(1).default(10).meta({
                description: "How many lines tall it is; more scroll (default: 10)",
            }),
            width: z
                .int()
                .min(BORDER_WIDTH + 1)
                .optional()
                .meta({
                    description:
                        "Its width in characters, border included (default: an equal share of " +
                        "what the frames with a width leave)",
                }),
            border: z.boolean().default(true).meta({
                description: "Whether it has a box-drawn border (default: true)",
            }),
            autoscroll: z
                .boolean()
                .default(true)
                .meta({
                    description:
                        "Whether it scrolls to follow its text as it types in, until the player " +
                        "scrolls it themselves (default: true)",
                }),
            content: z.lazy(content).meta({
                description: "Its elements, revealed in order, like a screen's",
            }),
            ...ElementBaseShape,
        })
        .meta({ description: "A frame: a panel of its own, which scrolls by itself" });

/** The frames schema, given the frame schema. */
export const createFramesSchema = (frame: ReturnType<typeof createFrameSchema>) =>
    z
        .strictObject({
            type: z.literal("frames"),
            frames: z.array(frame).min(1).meta({ description: "The frames, left to right" }),
            gap: z
                .int()
                .min(0)
                .default(1)
                .meta({ description: "Characters between the frames (default: 1)" }),
            minWidth: z
                .int()
                .min(BORDER_WIDTH + 1)
                .default(20)
                .meta({
                    description:
                        "The narrowest a frame can be, in characters: on a narrower screen, the " +
                        "frames stack, each the whole width (default: 20)",
                }),
            ...ElementBaseShape,
        })
        .meta({
            description:
                "Panels side by side, each revealing its own content at the same time as the " +
                "others, with its own cursor, and scrolling by itself. The screen carries on once " +
                "they've all finished. They can't hold pauses.",
        });

type FramesOutput = z.output<ReturnType<typeof createFramesSchema>>;

/** One frame, as an element of its own (made from a frames element when the program loads). */
export type FrameElement = Omit<FramesOutput["frames"][number], "content"> &
    ElementIdentity & {
        type: "frame";
        content: Element[];
        /** Its frames element's gap and minWidth, for laying it out among the others. */
        layout: { gap: number; minWidth: number };
    };

export type FramesElement = Omit<FramesOutput, "frames"> &
    ElementIdentity & { frames: FrameElement[] };

export const framesModule: ModuleDefinition<FramesElement> = {
    // nothing of its own to show; its frames are shown side by side
    text: () => "",
};

export const frameModule: ModuleDefinition<FrameElement> = {
    text: () => "",
};

/**
 * How frames sit in `columns` characters: each one's width, or, when one would be narrower
 * than minWidth, stacked, each the whole width.
 */
export function frameLayout(
    frames: readonly FrameElement[],
    columns: number,
): { stacked: boolean; widths: number[] } {
    const { gap, minWidth } = frames[0]?.layout ?? { gap: 1, minWidth: 20 };
    const fixed = frames.reduce((sum, frame) => sum + (frame.width ?? 0), 0);
    const flexible = frames.filter((frame) => frame.width === undefined).length;
    const left = columns - fixed - gap * (frames.length - 1);
    const share = flexible > 0 ? Math.floor(left / flexible) : 0;
    const widths = frames.map((frame) => frame.width ?? share);
    const stacked = left < 0 || widths.some((width) => width < Math.min(minWidth, columns));
    return stacked
        ? { stacked, widths: frames.map(() => columns) }
        : { stacked, widths: widths.map((width) => Math.min(width, columns)) };
}

/** The characters per line a frame's contents have, in a frame `width` wide. */
export function frameInner(frame: FrameElement, width: number): number {
    return Math.max(1, width - (frame.border ? BORDER_WIDTH : 0));
}

/** The top of a frame's border, `width` wide, its title set into it: ┌─ TITLE ───┐ */
export function frameTop(
    frame: FrameElement,
    width: number,
): { before: string; title: string; after: string } {
    const room = width - 2;
    if (!frame.title || room < 5)
        return { before: `┌${"─".repeat(Math.max(0, room))}┐`, title: "", after: "" };
    const title =
        frame.title.length > room - 4 ? `${frame.title.slice(0, room - 5)}~` : frame.title;
    return { before: "┌─ ", title, after: ` ${"─".repeat(room - 3 - title.length)}┐` };
}
