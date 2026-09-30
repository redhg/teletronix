import { z } from "zod";
import type { ElementIdentity, ModuleDefinition, RevealContext } from "../../engine/module.ts";
import {
    createReveal,
    type Frame,
    type Reveal,
    type RevealSpec,
} from "../../engine/reveal/index.ts";
import { ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";

export const CounterSchema = z
    .strictObject({
        type: z.literal("counter"),
        label: z.string().default("").meta({ description: "Text before the number" }),
        from: z.int().default(0).meta({ description: "Where it starts counting (default: 0)" }),
        to: z.int().meta({ description: "Where it stops counting" }),
        step: z
            .int()
            .positive()
            .default(1)
            .meta({ description: "Count in steps of this much, e.g. 64 (default: 1)" }),
        duration: z
            .number()
            .positive()
            .default(1500)
            .meta({ description: "Milliseconds to count from `from` to `to` (default: 1500)" }),
        unit: z.string().default("").meta({ description: 'Text right after the number, e.g. "K"' }),
        done: z
            .string()
            .default("")
            .meta({ description: 'Text added once it has finished counting, e.g. " OK"' }),
        align: ElementAlignSchema,
        ...ElementBaseShape,
    })
    .meta({
        description:
            "A number that counts up (or down) quickly to a target, like a computer's memory " +
            'test: "MEMORY TEST: 640K OK"',
    });

export type CounterElement = z.output<typeof CounterSchema> & ElementIdentity;

/** The line for the counter at `value`, with its `done` text once it has finished. */
export function counterLine(counter: CounterElement, value: number, finished: boolean): string {
    return `${counter.label}${value}${counter.unit}${finished ? counter.done : ""}`;
}

/** The value `t` (0 to 1) of the way through, in whole steps from `from`. */
export function counterValue(counter: CounterElement, t: number): number {
    if (t >= 1) return counter.to;
    const span = counter.to - counter.from;
    const steps = Math.trunc((Math.abs(span) * t) / counter.step);
    return counter.from + Math.sign(span) * steps * counter.step;
}

/** The line appears with the element's reveal (showing `from`), then counts to `to`. */
export function createCounterReveal(
    counter: CounterElement,
    spec: RevealSpec,
    context: RevealContext,
): Reveal {
    const intro = createReveal(counterLine(counter, counter.from, false), spec, context.random);
    const counting = context.instant ? 0 : counter.duration;
    let last: Frame = [];
    const frameOf = (text: string): Frame => {
        if (last.length !== 1 || last[0]?.text !== text) last = [{ kind: "visible", text }];
        return last;
    };
    return {
        duration: intro.duration + counting,
        frame(elapsed) {
            if (elapsed < intro.duration) return intro.frame(elapsed);
            const t = (elapsed - intro.duration) / counting;
            return frameOf(counterLine(counter, counterValue(counter, t), false));
        },
        final: () => frameOf(counterLine(counter, counter.to, true)),
    };
}

export const counterModule: ModuleDefinition<CounterElement> = {
    text: (counter) => counterLine(counter, counter.from, false),
    reveal: createCounterReveal,
};
