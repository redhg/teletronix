import { z } from "zod";
import type {
    ElementIdentity,
    ModuleDefinition,
    Outcome,
    RevealContext,
} from "../../engine/module.ts";
import type { Frame, Reveal } from "../../engine/reveal/index.ts";
import { type Action, ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";
import { OutcomeSchema } from "../progress/definition.ts";

export const CHARSETS = {
    symbols: "!#$%&*+/<=>?@[]^{|}~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    hex: "0123456789ABCDEF",
    binary: "01",
    letters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
} as const;

type CharsetName = keyof typeof CHARSETS;

/** Milliseconds between the scrambled characters changing. */
const SCRAMBLE = 60;

export const DecryptSchema = z
    .strictObject({
        type: z.literal("decrypt"),
        text: z
            .union([z.string().min(1), z.array(z.string()).min(1)])
            .transform((text) => (Array.isArray(text) ? text.join("\n") : text))
            .meta({ description: "The message it decrypts: a string, or a list of lines" }),
        duration: z
            .number()
            .positive()
            .default(3000)
            .meta({ description: "Milliseconds it takes to decrypt (default: 3000)" }),
        charset: z
            .union([
                z.enum(Object.keys(CHARSETS) as [CharsetName, ...CharsetName[]]),
                z.string().min(2),
            ])
            .default("symbols")
            .meta({
                description:
                    'The characters it scrambles with: "symbols", "hex", "binary", "letters", or ' +
                    'your own, e.g. "#%&@" (default: "symbols")',
            }),
        order: z
            .enum(["random", "sweep"])
            .default("random")
            .meta({
                description:
                    'Which characters come right first: "random", or "sweep", from the start to ' +
                    'the end (default: "random")',
            }),
        failAt: z.number().min(0).max(100).optional().meta({
            description:
                "Stop at this percentage, leaving the rest scrambled: a decryption that fails",
        }),
        bar: z.string().optional().meta({
            description: 'A progress bar under the message, after this label, e.g. "DECRYPTING "',
        }),
        done: z.string().default("COMPLETE").meta({
            description:
                'With bar, shown in place of the percentage at the end (default: "COMPLETE")',
        }),
        failed: z.string().default("FAILED").meta({
            description:
                'With bar, shown in place of the percentage when it fails (default: "FAILED")',
        }),
        onComplete: OutcomeSchema.optional().meta({
            description:
                "What happens once it has decrypted: an action, or { after, action } to pause first",
        }),
        onFail: OutcomeSchema.optional().meta({
            description:
                "What happens when it fails (with failAt): an action, or { after, action }",
        }),
        align: ElementAlignSchema,
        ...ElementBaseShape,
    })
    .meta({
        description:
            "A message that starts as scrambled characters and resolves, a few at a time, like a " +
            "codebreaker at work. It can fail partway, and show a progress bar.",
    });

export type DecryptElement = z.output<typeof DecryptSchema> & ElementIdentity;

const charsOf = (decrypt: DecryptElement) =>
    decrypt.charset in CHARSETS ? CHARSETS[decrypt.charset as CharsetName] : decrypt.charset;

/** A scrambled character for position `i` at moment `tick`: the same each time it's asked for. */
function scrambled(chars: string, i: number, tick: number): string {
    let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(tick + 1, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h ^= h >>> 13;
    return chars.charAt((h >>> 0) % chars.length);
}

/**
 * The progress line: its label, a bar filling the rest of the line, and the percentage or a
 * status. `reserve` keeps room for the longest status, so the bar never changes width.
 */
export function decryptBar(
    label: string,
    value: number,
    columns: number,
    status?: string,
    reserve = 4,
): string {
    const tail = status ?? `${Math.round(value)}%`.padStart(4);
    const width = Math.max(4, columns - label.length - 3 - Math.max(tail.length, reserve));
    const filled = Math.round((width * value) / 100);
    return `${label}[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${tail}`;
}

export interface DecryptReveal extends Reveal {
    readonly failed: boolean;
}

/**
 * Each character (but spaces and line breaks) is scrambled until its own moment comes, then
 * shows as itself. With failAt, it stops there, and the rest stays scrambled.
 */
export function createDecryptReveal(
    decrypt: DecryptElement,
    context: RevealContext,
): DecryptReveal {
    const text = decrypt.text;
    const chars = charsOf(decrypt);
    const random = context.random ?? Math.random;
    const scramblable = [...text].map((c) => c !== " " && c !== "\n");
    const count = scramblable.filter(Boolean).length;
    // the moment (0 to 1) each character comes right
    let k = 0;
    const moments = scramblable.map((can) => {
        if (!can) return 0;
        const at = decrypt.order === "sweep" ? (k + random() * 3) / (count + 3) : random();
        k++;
        // (never quite 0, so it starts fully scrambled)
        return Math.max(0.001, Math.min(1, at));
    });
    const stop = (decrypt.failAt ?? 100) / 100;
    const duration = context.instant ? 0 : decrypt.duration * stop;

    const line = (progress: number, tick: number) =>
        [...text]
            .map((c, i) =>
                scramblable[i] && (moments[i] ?? 0) > progress ? scrambled(chars, i, tick) : c,
            )
            .join("");
    const failed = decrypt.failAt !== undefined && decrypt.failAt < 100;
    const reserve = Math.max(4, (failed ? decrypt.failed : decrypt.done).length);
    const withBar = (message: string, value: number, status?: string) =>
        decrypt.bar === undefined
            ? message
            : `${message}\n${decryptBar(decrypt.bar, value, context.columns(), status, reserve)}`;

    let last: Frame = [];
    const frameOf = (value: string): Frame => {
        if (last.length !== 1 || last[0]?.text !== value) last = [{ kind: "visible", text: value }];
        return last;
    };
    return {
        duration,
        failed,
        frame(elapsed) {
            const progress = elapsed / decrypt.duration;
            const tick = Math.floor(elapsed / SCRAMBLE);
            return frameOf(withBar(line(progress, tick), progress * 100));
        },
        final() {
            // what's still scrambled when it fails holds still
            return frameOf(
                withBar(line(stop, 0), stop * 100, failed ? decrypt.failed : decrypt.done),
            );
        },
    };
}

export const decryptModule: ModuleDefinition<DecryptElement> = {
    text: (decrypt) =>
        decrypt.bar === undefined
            ? decrypt.text
            : `${decrypt.text}\n${decryptBar(decrypt.bar, 0, 80)}`,
    actions: (decrypt) =>
        [decrypt.onComplete?.action, decrypt.onFail?.action].filter(
            (action): action is Action => action !== undefined,
        ),
    reveal: (decrypt, _spec, context) => createDecryptReveal(decrypt, context),
    outcome(decrypt, reveal): Outcome | undefined {
        return (reveal as DecryptReveal).failed ? decrypt.onFail : decrypt.onComplete;
    },
};
