import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";
import { type Clock, ClockShape, formatTime } from "../../engine/schema/timers.ts";
import { VariableNameSchema } from "../../engine/schema/variables.ts";

export const TimerElementSchema = z
    .strictObject({
        type: z.literal("timer"),
        label: z
            .string()
            .default("")
            .meta({ description: 'Text before the time, e.g. "T-MINUS "' }),
        timer: VariableNameSchema.optional().meta({
            description:
                "A timer from config.timers to show. Without one, the element runs a timer of " +
                "its own, set up with from, to, format and onComplete.",
        }),
        ...ClockShape,
        align: ElementAlignSchema,
        ...ElementBaseShape,
    })
    .superRefine((element, ctx) => {
        if (element.timer === undefined && element.from === element.to) {
            ctx.addIssue({
                code: "custom",
                path: ["from"],
                message: 'Set "timer" to show a program timer, or "from" and "to" for its own',
            });
        }
    })
    .meta({
        description:
            'A clock on the screen: a program timer (with "timer"), or a timer of its own, ' +
            "which starts once it's revealed, runs while the screen is showing, and runs " +
            "onComplete when it reaches to.",
    });

export type TimerElement = z.output<typeof TimerElementSchema> & ElementIdentity;

/** A timer element's own clock, when it doesn't show a program timer. */
export const ownClock = (element: TimerElement): Clock => ({
    from: element.from,
    to: element.to,
    format: element.format,
    ...(element.onComplete ? { onComplete: element.onComplete } : {}),
});

/** A timer element's memory is its time, as shown (e.g. "01:30"). */
export const timerModule: ModuleDefinition<TimerElement, string> = {
    text: (element, memory) =>
        `${element.label}${memory ?? formatTime(ownClock(element), element.from * 1000)}`,
    actions: (element) => (element.onComplete && !element.timer ? [element.onComplete] : []),
};
