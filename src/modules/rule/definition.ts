import { z } from "zod";
import type { ElementIdentity, ModuleDefinition, RevealContext } from "../../engine/module.ts";
import {
    createReveal,
    type Frame,
    type Reveal,
    type RevealSpec,
} from "../../engine/reveal/index.ts";
import { ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";

export const HorizontalRuleSchema = z
    .strictObject({
        type: z.literal("rule"),
        char: z
            .string()
            .min(1)
            .default("─")
            .meta({
                description:
                    'What it\'s drawn with: a character, or a pattern repeated along it, e.g. "═", ' +
                    '"=", "-=" or "·:·" (default: "─")',
            }),
        label: z.string().optional().meta({
            description: 'Text set into it, e.g. "CREW MANIFEST": ──── CREW MANIFEST ────',
        }),
        labelAlign: z.enum(["left", "center", "right"]).default("center").meta({
            description: 'Where the label goes: "left", "center" or "right" (default: "center")',
        }),
        padding: z.int().min(0).default(1).meta({
            description: "Spaces either side of the label (default: 1)",
        }),
        ends: z.tuple([z.string(), z.string()]).optional().meta({
            description: 'Characters at each end, e.g. ["├", "┤"] to join a box, or ["<", ">"]',
        }),
        cols: z.int().min(1).optional().meta({
            description:
                "Its width in characters (default: the whole line); on a narrower screen, it fits the screen",
        }),
        align: ElementAlignSchema,
        ...ElementBaseShape,
    })
    .meta({
        description:
            "A horizontal rule: a line across the screen (or a section or column) of any " +
            "character or pattern, with an optional label set into it. It always fits the width.",
    });

export type RuleElement = z.output<typeof HorizontalRuleSchema> & ElementIdentity;

/** `count` characters of the pattern, from its start. */
const fill = (pattern: string, count: number) =>
    count <= 0 ? "" : pattern.repeat(Math.ceil(count / pattern.length)).slice(0, count);

/** The rule's line, `columns` wide (or its own cols, if narrower). */
export function ruleLine(rule: RuleElement, columns: number): string {
    const width = Math.max(1, Math.min(rule.cols ?? columns, columns));
    const [left = "", right = ""] = rule.ends ?? [];
    const inner = Math.max(0, width - left.length - right.length);
    if (rule.label === undefined || rule.label === "") {
        return `${left}${fill(rule.char, inner)}${right}`;
    }

    // at least two of the pattern either side of the label, if there's room
    const pad = " ".repeat(rule.padding);
    const room = inner - 2 * rule.padding - 4;
    if (room < 1) return `${left}${fill(rule.char, inner)}${right}`;
    const label = rule.label.length > room ? `${rule.label.slice(0, room - 1)}~` : rule.label;
    const middle = `${pad}${label}${pad}`;
    const spare = inner - middle.length;
    const before =
        rule.labelAlign === "left"
            ? 2
            : rule.labelAlign === "right"
              ? spare - 2
              : Math.floor(spare / 2);
    return `${left}${fill(rule.char, before)}${middle}${fill(rule.char, spare - before)}${right}`;
}

/**
 * The line appears with the element's reveal (typed, by default), at the width there is when
 * it starts, and is redrawn at the width there is whenever that changes.
 */
export function createRuleReveal(
    rule: RuleElement,
    spec: RevealSpec,
    context: RevealContext,
): Reveal {
    const intro = createReveal(ruleLine(rule, context.columns()), spec, context.random);
    let last: Frame = [];
    return {
        duration: intro.duration,
        frame: (elapsed) => intro.frame(elapsed),
        final() {
            const text = ruleLine(rule, context.columns());
            if (last.length !== 1 || last[0]?.text !== text) last = [{ kind: "visible", text }];
            return last;
        },
    };
}

export const ruleModule: ModuleDefinition<RuleElement> = {
    text: (rule) => ruleLine(rule, 80),
    reveal: createRuleReveal,
};
