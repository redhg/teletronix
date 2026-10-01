import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { createTimedReveal } from "../../engine/reveal/index.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";

export const LogSchema = z
    .strictObject({
        type: z.literal("log"),
        lines: z
            .array(z.string())
            .min(1)
            .meta({
                description:
                    "The lines that arrive, in order (they can show variables and inline markup, " +
                    "e.g. [alert]WARNING[/])",
            }),
        interval: z.number().positive().default(1500).meta({
            description:
                "Milliseconds between lines, varied a little each time so it looks alive (default: 1500)",
        }),
        loop: z.boolean().default(false).meta({
            description:
                "Start the lines again once they've all arrived, for good (default: false)",
        }),
        order: z.enum(["sequence", "random"]).default("sequence").meta({
            description: 'The order lines arrive in: "sequence" or "random" (default: "sequence")',
        }),
        time: z
            .string()
            .regex(/^\d{1,2}:\d{2}(:\d{2})?$/)
            .optional()
            .meta({
                description:
                    'A clock time to start from, e.g. "06:12" or "06:12:30": each line gets the ' +
                    "time it arrived, [06:12:03], counting real seconds",
            }),
        rows: z
            .int()
            .min(1)
            .optional()
            .meta({
                description:
                    "Keep only this many of the latest lines, the oldest going as new ones come " +
                    "(default: all of them, or 10 when it loops)",
            }),
        ...ElementBaseShape,
    })
    .meta({
        description:
            "A live log: lines that keep arriving, one every so often, like a ship's systems " +
            "reporting in. It runs alongside the rest of the screen.",
    });

export type LogElement = z.output<typeof LogSchema> & ElementIdentity;

/** Seconds since midnight for a clock time like "06:12" or "06:12:30". */
export function clockSeconds(time: string): number {
    const [hours = 0, minutes = 0, seconds = 0] = time.split(":").map(Number);
    return hours * 3600 + minutes * 60 + seconds;
}

/** A clock time, as [HH:MM:SS], `seconds` after midnight (wrapping round the day). */
export function stamp(seconds: number): string {
    const day = ((Math.floor(seconds) % 86_400) + 86_400) % 86_400;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `[${pad(Math.floor(day / 3600))}:${pad(Math.floor((day % 3600) / 60))}:${pad(day % 60)}]`;
}

/** The order the lines arrive in, for one pass through them. */
export function passOrder(log: LogElement, random: () => number): number[] {
    const order = log.lines.map((_, i) => i);
    if (log.order === "random") {
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [order[i], order[j]] = [order[j] as number, order[i] as number];
        }
    }
    return order;
}

export const logModule: ModuleDefinition<LogElement> = {
    // (the view adds its lines as they arrive)
    text: () => "",
    reveal: () => createTimedReveal(0),
};
