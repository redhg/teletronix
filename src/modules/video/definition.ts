import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { createTimedReveal } from "../../engine/reveal/index.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";

export const VideoSchema = z
    .strictObject({
        type: z.literal("video"),
        src: z
            .string()
            .min(1)
            .meta({
                description:
                    'A video, relative to the page, e.g. "data/video/radar.mp4", or a web address. ' +
                    "MP4 plays in every browser.",
            }),
        alt: z.string().min(1).meta({ description: "What it shows, for screen readers" }),
        cols: z
            .int()
            .min(1)
            .optional()
            .meta({
                description:
                    "Its width in character columns; its height follows, keeping its shape. On a " +
                    "narrower screen, it shrinks to fit (default: the video's own width, or the screen's)",
            }),
        loop: z.boolean().default(true).meta({
            description: "Play it over and over (default: true)",
        }),
        muted: z
            .boolean()
            .default(true)
            .meta({
                description:
                    "Play it without its sound (default: true: a clip among the text is quiet, " +
                    "like an animated picture)",
            }),
        expand: z
            .boolean()
            .default(true)
            .meta({
                description:
                    "A click (or Enter) shows it over the whole window, with its sound, as an " +
                    'action\'s "view" does (default: true)',
            }),
        ...ElementBaseShape,
    })
    .meta({
        description:
            "A video among the text: playing as the screen reaches it, looping and silent by " +
            "default; a click shows it over the whole window",
    });

export type VideoElement = z.output<typeof VideoSchema> & ElementIdentity;

export const videoModule: ModuleDefinition<VideoElement> = {
    text: () => "",
    // (it's there at once; it plays from the start)
    reveal: () => createTimedReveal(0),
};
