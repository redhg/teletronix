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
import { OutcomeSchema } from "../progress/definition.ts";

/** The spinner's looks, and the milliseconds each frame shows. */
export const SPINNER_STYLES = {
    line: { frames: ["|", "/", "-", "\\"], speed: 100 },
    dots: { frames: [".  ", ".. ", "...", "   "], speed: 350 },
    blocks: { frames: ["▖", "▘", "▝", "▗"], speed: 120 },
    bar: {
        frames: [
            "[=    ]",
            "[ =   ]",
            "[  =  ]",
            "[   = ]",
            "[    =]",
            "[   = ]",
            "[  =  ]",
            "[ =   ]",
        ],
        speed: 90,
    },
} as const;

type StyleName = keyof typeof SPINNER_STYLES;

export const SpinnerInterruptSchema = z
    .strictObject({
        key: KeysSchema.meta({
            description: 'The key that aborts it: "any", a key name, or an array',
        }),
        text: z
            .string()
            .min(1)
            .default("ABORTED")
            .meta({ description: 'Shown in place of the spinner (default: "ABORTED")' }),
        action: ActionSchema.optional().meta({
            description: "What happens when aborted, instead of onComplete",
        }),
        after: z.number().min(0).optional().meta({
            description: "Milliseconds to wait before the action",
        }),
    })
    .meta({ description: "A key that aborts a spinner while it spins" });

export const SpinnerSchema = z
    .strictObject({
        type: z.literal("spinner"),
        label: z.string().default("").meta({ description: "Text before the spinner" }),
        style: z
            .union([
                z.enum(Object.keys(SPINNER_STYLES) as [StyleName, ...StyleName[]]),
                z.array(z.string().min(1)).min(2),
            ])
            .default("line")
            .meta({
                description:
                    'How it looks: "line" (| / - \\), "dots" (. .. ...), "blocks" (▖ ▘ ▝ ▗), "bar" ' +
                    '(a bouncing [=   ]), or a list of your own frames, e.g. ["◐", "◓", "◑", "◒"] ' +
                    '(default: "line")',
            }),
        speed: z.int().positive().optional().meta({
            description: "Milliseconds each frame shows (default: one to suit its style)",
        }),
        duration: z
            .number()
            .positive()
            .optional()
            .meta({
                description:
                    "Milliseconds it spins, holding the rest of the screen. Without one, it spins " +
                    "until the player presses a key or taps.",
            }),
        countdown: z.boolean().default(false).meta({
            description:
                "Show the seconds left after the spinner, for one with a duration (default: false)",
        }),
        done: z
            .string()
            .optional()
            .meta({
                description:
                    'Shown in place of the spinner once it has finished, e.g. "OK". Without it, ' +
                    "the line goes once it's finished.",
            }),
        onComplete: OutcomeSchema.optional().meta({
            description:
                "What happens when it finishes: an action, or { after, action } to pause first. " +
                "Without one, the screen carries on.",
        }),
        interrupt: SpinnerInterruptSchema.optional().meta({
            description: "A key that aborts it, showing its text and running its action",
        }),
        ...ElementBaseShape,
    })
    .meta({
        description:
            "A line that spins while something seems to happen: for a set time, or until a key " +
            "press. It holds the rest of the screen, then shows its done text (or goes).",
    });

export type SpinnerElement = z.output<typeof SpinnerSchema> & ElementIdentity;

/** The frames it cycles through, all padded to one width so the line never jumps. */
export function spinnerFrames(spinner: SpinnerElement): string[] {
    const frames: readonly string[] = Array.isArray(spinner.style)
        ? spinner.style
        : SPINNER_STYLES[spinner.style as StyleName].frames;
    const width = Math.max(...frames.map((frame) => frame.length));
    return frames.map((frame) => frame.padEnd(width));
}

export const spinnerSpeed = (spinner: SpinnerElement) =>
    spinner.speed ??
    (Array.isArray(spinner.style) ? 150 : SPINNER_STYLES[spinner.style as StyleName].speed);

/** The line while it spins: its label, a frame, and the seconds left if it counts down. */
export function spinnerLine(spinner: SpinnerElement, frame: string, remaining?: number): string {
    if (!spinner.countdown || spinner.duration === undefined || remaining === undefined) {
        return `${spinner.label}${frame}`;
    }
    const seconds = Math.ceil(Math.max(0, remaining) / 1000);
    const width = String(Math.ceil(spinner.duration / 1000)).length;
    return `${spinner.label}${frame} ${String(seconds).padStart(width)}`;
}

export interface SpinnerReveal extends Reveal {
    /** Whether its interrupt key stopped it. */
    readonly aborted: boolean;
}

/**
 * The label appears with the element's reveal (typing, by default), then the spinner turns
 * for its duration, or until a key press when it has none (a reveal that never ends by
 * itself). Its interrupt key aborts it; with no duration, any other key finishes it.
 */
export function createSpinnerReveal(
    spinner: SpinnerElement,
    spec: RevealSpec,
    context: RevealContext,
): SpinnerReveal {
    const frames = spinnerFrames(spinner);
    const speed = spinnerSpeed(spinner);
    const intro = createReveal(spinnerLine(spinner, frames[0] ?? ""), spec, context.random);
    const spinning = spinner.duration ?? Number.POSITIVE_INFINITY;
    let aborted = false;
    let last: Frame = [];
    const frameOf = (text: string): Frame => {
        if (last.length !== 1 || last[0]?.text !== text) last = [{ kind: "visible", text }];
        return last;
    };

    return {
        duration: intro.duration + spinning,
        get aborted() {
            return aborted;
        },
        frame(elapsed) {
            if (elapsed < intro.duration) return intro.frame(elapsed);
            const into = elapsed - intro.duration;
            // (with reduced motion, it holds still, but still takes its time)
            const turn = context.instant ? 0 : Math.floor(into / speed) % frames.length;
            return frameOf(spinnerLine(spinner, frames[turn] ?? "", spinning - into));
        },
        final() {
            if (aborted) return frameOf(`${spinner.label}${spinner.interrupt?.text ?? ""}`);
            // without done text, the line goes (see the view)
            return frameOf(spinner.done === undefined ? "" : `${spinner.label}${spinner.done}`);
        },
        interrupt(_elapsed, key) {
            const abortKey = spinner.interrupt?.key;
            aborted = abortKey !== undefined && keyMatches(abortKey, key);
        },
    };
}

export const spinnerModule: ModuleDefinition<SpinnerElement> = {
    text: (spinner) => spinnerLine(spinner, spinnerFrames(spinner)[0] ?? ""),
    actions: (spinner) =>
        [spinner.onComplete?.action, spinner.interrupt?.action].filter(
            (action): action is Action => action !== undefined,
        ),
    reveal: createSpinnerReveal,
    outcome(spinner, reveal): Outcome | undefined {
        if ((reveal as SpinnerReveal).aborted) {
            const action = spinner.interrupt?.action;
            return action ? { action, after: spinner.interrupt?.after ?? 0 } : undefined;
        }
        return spinner.onComplete;
    },
    interruptKey(spinner, key) {
        if (spinner.interrupt && keyMatches(spinner.interrupt.key, key)) return true;
        // one without a duration spins until any key
        return spinner.duration === undefined && keyMatches(["any"], key);
    },
};
