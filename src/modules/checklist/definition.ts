import { z } from "zod";
import type { ElementIdentity, ModuleDefinition, RevealContext } from "../../engine/module.ts";
import {
    createReveal,
    type Frame,
    type Reveal,
    type RevealSpec,
    type Segment,
} from "../../engine/reveal/index.ts";
import { ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";

export const DEFAULT_CHECKLIST_STATUS = "[ OK ]";
export const DEFAULT_CHECKLIST_DELAY = 300;

export const ChecklistItemObjectSchema = z
    .strictObject({
        text: z.string().min(1).meta({ description: "The line" }),
        status: z.string().optional().meta({
            description: 'Its own status, e.g. "[FAIL]" (default: the checklist\'s)',
        }),
        delay: z
            .number()
            .min(0)
            .optional()
            .meta({
                description:
                    "Milliseconds before its status appears, exactly (default: the checklist's, " +
                    "varied a little)",
            }),
    })
    .meta({ description: "A line with its own status or delay" });

export const ChecklistItemSchema = z
    .union([
        z.string().min(1).meta({ description: "A line, which gets the checklist's status" }),
        ChecklistItemObjectSchema,
    ])
    .meta({ description: "A line of a checklist" });

export const ChecklistSchema = z
    .strictObject({
        type: z.literal("checklist"),
        items: z.array(ChecklistItemSchema).min(1).meta({
            description: 'The lines, in order: strings, or { "text", "status", "delay" }',
        }),
        status: z
            .string()
            .default(DEFAULT_CHECKLIST_STATUS)
            .meta({
                description: `What appears at the end of each line once it's done (default: "${DEFAULT_CHECKLIST_STATUS}")`,
            }),
        delay: z
            .number()
            .min(0)
            .default(DEFAULT_CHECKLIST_DELAY)
            .meta({
                description:
                    "Milliseconds between a line appearing and its status, varied a little from " +
                    `line to line so it looks like real work (default: ${DEFAULT_CHECKLIST_DELAY})`,
            }),
        leader: z
            .string()
            .length(1)
            .default(".")
            .meta({
                description:
                    'The character that fills the gap between a line and its status (default: "."; ' +
                    '" " for none)',
            }),
        width: z.int().min(1).optional().meta({
            description:
                "Where the statuses end, in characters from the left (default: the right edge)",
        }),
        align: ElementAlignSchema,
        ...ElementBaseShape,
    })
    .meta({
        description:
            "Lines that appear one at a time, each followed after a moment by a status such as " +
            '"[ OK ]", like a computer starting up',
    });

export type ChecklistElement = z.output<typeof ChecklistSchema> & ElementIdentity;

interface Item {
    text: string;
    status: string;
    /** Exactly, or undefined to vary the checklist's. */
    delay?: number;
}

const itemsOf = (checklist: ChecklistElement): Item[] =>
    checklist.items.map((item) =>
        typeof item === "string"
            ? { text: item, status: checklist.status }
            : { text: item.text, status: item.status ?? checklist.status, delay: item.delay },
    );

/** A finished line: its text, then the leader up to its status, which ends at `width`. */
export function checklistLine(item: Item, leader: string, width: number): string {
    if (item.status === "") return item.text;
    const gap = width - item.text.length - item.status.length - 2;
    if (gap < 1) return `${item.text} ${item.status}`;
    return `${item.text} ${leader.repeat(gap)} ${item.status}`;
}

/**
 * Each line appears with the element's reveal (typing, by default), then the cursor waits
 * at its end for the delay, then the leader and status appear at once. The lines still to
 * come are hidden, keeping their space.
 */
export function createChecklistReveal(
    checklist: ChecklistElement,
    spec: RevealSpec,
    context: RevealContext,
): Reveal {
    const items = itemsOf(checklist);
    const lines = () => {
        const width = Math.min(checklist.width ?? Number.POSITIVE_INFINITY, context.columns());
        return items.map((item) => checklistLine(item, checklist.leader, width));
    };
    const random = context.random ?? Math.random;
    const steps = items.map((item) => {
        const reveal = createReveal(item.text, context.instant ? { type: "instant" } : spec);
        const wait = context.instant ? 0 : (item.delay ?? checklist.delay * (0.5 + random()));
        return { reveal, wait };
    });
    const starts: number[] = [];
    let duration = 0;
    for (const step of steps) {
        starts.push(duration);
        duration += step.reveal.duration + step.wait;
    }

    return {
        duration,
        frame(elapsed) {
            const all = lines();
            let i = steps.length - 1;
            while (i > 0 && (starts[i] ?? 0) > elapsed) i--;
            const step = steps[i];
            const line = all[i] ?? "";
            if (!step) return this.final();

            const done = all
                .slice(0, i)
                .map((l) => `${l}\n`)
                .join("");
            const rest = all
                .slice(i + 1)
                .map((l) => `\n${l}`)
                .join("");
            const into = elapsed - (starts[i] ?? 0);
            const text = items[i]?.text ?? "";
            const typed: Segment[] =
                into < step.reveal.duration
                    ? [...step.reveal.frame(into)]
                    : [{ kind: "visible", text }];
            const tail = line.slice(text.length);
            // while it waits, the cursor sits just after the line's text
            const waiting = into >= step.reveal.duration && tail.length > 0;
            const segments: Segment[] = [
                { kind: "visible", text: done },
                ...typed,
                ...(waiting
                    ? [
                          { kind: "cursor", text: tail.charAt(0) } as const,
                          { kind: "hidden", text: tail.slice(1) + rest } as const,
                      ]
                    : [{ kind: "hidden", text: tail + rest } as const]),
            ];
            return segments.filter((segment) => segment.text !== "");
        },
        final: (): Frame => [{ kind: "visible", text: lines().join("\n") }],
    };
}

export const checklistModule: ModuleDefinition<ChecklistElement> = {
    text: (checklist) =>
        itemsOf(checklist)
            .map((item) => checklistLine(item, checklist.leader, checklist.width ?? 80))
            .join("\n"),
    reveal: createChecklistReveal,
};
