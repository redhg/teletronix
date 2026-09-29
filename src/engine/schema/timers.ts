import { z } from "zod";
import { type Action, ActionSchema } from "./common.ts";
import { VariableNameSchema } from "./variables.ts";

// ─── Timers ──────────────────────────────────────────────────────────────────
// Clocks that count down (or up) in seconds, such as a self-destruct countdown. A program's
// timers keep running from screen to screen; a timer element can also run one of its own.

export const TIME_FORMATS = ["mm:ss", "hh:mm:ss", "ss"] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

export const TimeFormatSchema = z.enum(TIME_FORMATS).meta({
    description: 'How the time is shown: "mm:ss" (01:30), "hh:mm:ss" (00:01:30) or "ss" (90)',
});

/** A timer's clock: the options a program timer and a timer element's own timer share. */
export const ClockShape = {
    from: z.number().min(0).default(0).meta({ description: "Seconds it starts at (default: 0)" }),
    to: z.number().min(0).default(0).meta({
        description:
            "Seconds it stops at: lower than from to count down, higher to count up (default: 0)",
    }),
    format: TimeFormatSchema.default("mm:ss").meta({
        description: 'How the time is shown: "mm:ss", "hh:mm:ss" or "ss" (default: "mm:ss")',
    }),
    onComplete: ActionSchema.optional().meta({
        description: "What happens when it reaches to",
    }),
};

export const TimerSchema = z
    .strictObject({
        ...ClockShape,
        autostart: z
            .boolean()
            .default(false)
            .meta({
                description:
                    'Start running when the program does, rather than at a "startTimer" action ' +
                    "(default: false)",
            }),
    })
    .refine((timer) => timer.from !== timer.to, { message: '"from" and "to" must differ' })
    .meta({
        description:
            "A clock that keeps running from screen to screen: started, stopped and reset by " +
            'actions ("startTimer", "stopTimer", "resetTimer"), shown in text as "{name}" and ' +
            "by timer elements, and tested by conditions as its seconds. Its onComplete runs on " +
            "whatever screen the player is on.",
    });

export const TimersSchema = z.record(VariableNameSchema, TimerSchema).meta({
    description:
        "The program's timers, by name: clocks that keep running from screen to screen, such " +
        "as a self-destruct countdown",
});

export interface Clock {
    from: number;
    to: number;
    format: TimeFormat;
    onComplete?: Action;
}

export type Timer = Clock & { autostart: boolean };

/** Whether a clock counts down (from above to) rather than up. */
export const countsDown = (clock: Clock) => clock.from > clock.to;

/** The whole seconds a clock shows at `ms`: counting down, a part-second counts as a whole. */
export const shownSeconds = (clock: Clock, ms: number) =>
    countsDown(clock) ? Math.ceil(ms / 1000 - 1e-9) : Math.floor(ms / 1000 + 1e-9);

const pad = (n: number) => String(n).padStart(2, "0");

/** A clock's time at `ms`, as its format shows it. */
export function formatTime(clock: Clock, ms: number): string {
    const seconds = Math.max(0, shownSeconds(clock, ms));
    if (clock.format === "ss") return String(seconds);
    const s = seconds % 60;
    if (clock.format === "hh:mm:ss") {
        return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(s)}`;
    }
    return `${pad(Math.floor(seconds / 60))}:${pad(s)}`;
}
