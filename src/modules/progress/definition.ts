import { z } from "zod";
import type {
    ElementIdentity,
    ModuleDefinition,
    Outcome,
    RevealContext,
} from "../../engine/module.ts";
import {
    createReveal,
    type Frame,
    type Reveal,
    type RevealSpec,
} from "../../engine/reveal/index.ts";
import { type Action, ActionSchema, ElementBaseShape } from "../../engine/schema/common.ts";
import { KeysSchema, keyMatches } from "../../engine/schema/next.ts";

const PercentSchema = z.number().min(0).max(100);

export const DelayedActionSchema = z
    .strictObject({
        after: z.number().min(0).optional().meta({ description: "Milliseconds to wait first" }),
        action: ActionSchema.meta({ description: "What happens" }),
    })
    .meta({ description: "An action that runs after a pause" });

export const OutcomeSchema = z
    .union([ActionSchema, DelayedActionSchema])
    .transform(
        (outcome): Outcome =>
            "action" in outcome
                ? { after: outcome.after ?? 0, action: outcome.action }
                : { after: 0, action: outcome },
    )
    .meta({
        description: "What happens when a progress bar finishes: an action, now or after a pause",
    });

export const InterruptSchema = z
    .strictObject({
        at: PercentSchema.optional().meta({
            description: "Stop here instead of reaching `to`: a transfer that fails",
        }),
        key: KeysSchema.optional().meta({
            description: 'A key that aborts the bar while it runs: "any", a key name, or an array',
        }),
        text: z
            .string()
            .min(1)
            .default("INTERRUPTED")
            .meta({ description: 'Shown in place of the percentage (default: "INTERRUPTED")' }),
        action: ActionSchema.optional().meta({
            description: "What happens when interrupted, instead of onComplete",
        }),
        after: z.number().min(0).optional().meta({
            description: "Milliseconds to wait before the action",
        }),
    })
    .refine((interrupt) => interrupt.at !== undefined || interrupt.key !== undefined, {
        message: 'Set "at", "key", or both',
    })
    .meta({
        description:
            "Makes a progress bar stop short: at a set point (a transfer that fails) and/or when " +
            "the player presses a key",
    });

export const ProgressSchema = z
    .strictObject({
        type: z.literal("progress"),
        label: z.string().optional().meta({ description: "Text before the bar" }),
        from: PercentSchema.default(0).meta({ description: "Starting percentage (default: 0)" }),
        to: PercentSchema.default(100).meta({
            description: "Final percentage (default: 100). Lower than `from` runs backwards.",
        }),
        duration: z
            .number()
            .positive()
            .default(2000)
            .meta({ description: "Milliseconds to go from `from` to `to` (default: 2000)" }),
        percent: z
            .boolean()
            .default(true)
            .meta({ description: "Show the current value (default: true)" }),
        width: z
            .int()
            .min(1)
            .optional()
            .meta({ description: "Bar width in characters (default: the rest of the line)" }),
        fill: z
            .string()
            .length(1)
            .default("█")
            .meta({ description: 'Filled cells (default: "█")' }),
        empty: z
            .string()
            .length(1)
            .default("░")
            .meta({ description: 'Empty cells (default: "░")' }),
        onComplete: OutcomeSchema.optional().meta({
            description:
                "What happens when the bar reaches `to`: an action, or { after, action } to " +
                "pause first. Without one, the screen carries on.",
        }),
        interrupt: InterruptSchema.optional().meta({
            description: "Makes the bar stop short, at a set point (`at`) or a key press (`key`)",
        }),
        ...ElementBaseShape,
    })
    .superRefine((bar, ctx) => {
        const at = bar.interrupt?.at;
        const between =
            at !== undefined && Math.min(bar.from, bar.to) < at && at < Math.max(bar.from, bar.to);
        if (at !== undefined && !between) {
            ctx.addIssue({
                code: "custom",
                path: ["interrupt", "at"],
                message: "at must be between from and to",
            });
        }
    })
    .meta({
        description:
            "A text progress bar that runs from one percentage to another over a set time, " +
            "then carries on, or runs an action",
    });

export type ProgressElement = z.output<typeof ProgressSchema> & ElementIdentity;

/** The line for a bar at `value` percent, fitted to `columns`, with `status` for the percentage. */
export function progressLine(
    bar: ProgressElement,
    value: number,
    columns: number,
    status?: string,
): string {
    const label = bar.label ?? "";
    // room for the percentage or the interruption text, so the bar never changes width
    const reserve = Math.max(
        bar.percent ? 5 : 0,
        bar.interrupt ? bar.interrupt.text.length + 1 : 0,
    );
    const width = bar.width ?? Math.max(4, columns - label.length - 2 - reserve);
    const filled = Math.round((width * value) / 100);

    const tail =
        status !== undefined
            ? ` ${status}`
            : bar.percent
              ? ` ${`${Math.round(value)}%`.padStart(4)}`
              : "";
    return `${label}[${bar.fill.repeat(filled)}${bar.empty.repeat(width - filled)}]${tail}`;
}

export interface ProgressReveal extends Reveal {
    /** Whether the bar stopped short: at `interrupt.at`, or at a key press. */
    readonly interrupted: boolean;
}

/**
 * The line appears with the element's reveal (teletype, glitch, …) showing `from`, then the
 * bar runs to `to`, or to `interrupt.at`, which it reaches after the same proportion of
 * `duration` that it would have on the way to `to`.
 */
export function createProgressReveal(
    bar: ProgressElement,
    spec: RevealSpec,
    context: RevealContext,
): ProgressReveal {
    const line = (value: number, status?: string) =>
        progressLine(bar, value, context.columns(), status);
    const intro = createReveal(line(bar.from), spec, context.random);

    const stop = bar.interrupt?.at;
    const target = stop ?? bar.to;
    const span = Math.abs(bar.to - bar.from);
    const fillTime =
        span === 0 ? bar.duration : (bar.duration * Math.abs(target - bar.from)) / span;
    const valueAt = (elapsed: number) => {
        const t = Math.min(Math.max((elapsed - intro.duration) / fillTime, 0), 1);
        return bar.from + (target - bar.from) * t;
    };

    // the value a key press stopped the bar at
    let stoppedAt: number | undefined;
    let last: Frame = [];
    const frameOf = (text: string): Frame => {
        if (last.length !== 1 || last[0]?.text !== text) last = [{ kind: "visible", text }];
        return last;
    };

    return {
        duration: intro.duration + fillTime,
        get interrupted() {
            return stoppedAt !== undefined || stop !== undefined;
        },
        frame(elapsed) {
            return elapsed < intro.duration
                ? intro.frame(elapsed)
                : frameOf(line(valueAt(elapsed)));
        },
        final() {
            if (stoppedAt !== undefined) return frameOf(line(stoppedAt, bar.interrupt?.text));
            if (stop !== undefined) return frameOf(line(stop, bar.interrupt?.text));
            return frameOf(line(bar.to));
        },
        interrupt(elapsed) {
            stoppedAt = valueAt(elapsed);
        },
    };
}

export const progressModule: ModuleDefinition<ProgressElement> = {
    text: (bar) => progressLine(bar, bar.from, 80),
    actions: (bar) =>
        [bar.onComplete?.action, bar.interrupt?.action].filter(
            (action): action is Action => action !== undefined,
        ),
    reveal: createProgressReveal,
    outcome(bar, reveal) {
        if ((reveal as ProgressReveal).interrupted) {
            const action = bar.interrupt?.action;
            return action ? { action, after: bar.interrupt?.after ?? 0 } : undefined;
        }
        return bar.onComplete;
    },
    interruptKey: (bar, key) => (bar.interrupt?.key ? keyMatches(bar.interrupt.key, key) : false),
};
