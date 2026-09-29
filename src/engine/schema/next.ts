import { z } from "zod";
import { type Action, ActionSchema } from "./common.ts";
import { type Condition, ConditionSchema } from "./variables.ts";

// Friendlier names for keys whose KeyboardEvent.key is awkward to write
const KEY_ALIASES: Record<string, string> = {
    space: " ",
    spacebar: " ",
    esc: "escape",
    return: "enter",
};

/** Keys that never count as "any": modifiers, and Tab (it moves focus). */
const NOT_ANY = new Set(["shift", "control", "alt", "meta", "capslock", "tab"]);

/** Normalizes a key name for comparison: lower case, with aliases resolved. */
export function normalizeKey(key: string): string {
    const lower = key.toLowerCase();
    return KEY_ALIASES[lower] ?? lower;
}

const KeyNameSchema = z.string().min(1);

/** The keys that finish a screen's reveal, unless the program sets its own. */
export const DEFAULT_SKIP_KEYS = ["escape"];

export const SkipKeysSchema = z
    .array(KeyNameSchema)
    .transform((keys) => keys.map(normalizeKey))
    .meta({
        description:
            "Keys that finish revealing the screen at once, like a click, when the program " +
            'doesn\'t use them for anything else: key names like "Escape" or "Space", or [] for ' +
            'none. In kiosk mode, Esc also leaves full screen, so try ["Space"] (default: ["Escape"])',
    });

/** One key name or several, normalized to a list. */
export const KeysSchema = z
    .union([KeyNameSchema, z.array(KeyNameSchema).min(1)])
    .transform((key) => (Array.isArray(key) ? key : [key]).map(normalizeKey))
    .meta({
        description:
            'One key or several: "any", or key names like "Enter", "Escape", "ArrowRight" or "y" ' +
            '(case-insensitive), with the aliases "Space", "Esc" and "Return"',
    });

export const RuleSchema = z
    .strictObject({
        after: z
            .number()
            .min(0)
            .optional()
            .meta({ description: "Milliseconds to wait after the screen has finished revealing" }),
        key: z
            .union([KeyNameSchema, z.array(KeyNameSchema).min(1)])
            .optional()
            .meta({
                description:
                    'A key that moves on: "any", a key name like "Enter", "Space", "Escape", ' +
                    '"ArrowRight" or "y", or an array of them. Taps and clicks count too, ' +
                    "unless keys in different rules lead to different places.",
            }),
        if: ConditionSchema.optional().meta({
            description: "Only while this holds, e.g. a key that works once a door is unlocked",
        }),
        action: ActionSchema.meta({ description: "What happens" }),
    })
    .refine((rule) => rule.after !== undefined || rule.key !== undefined, {
        message: 'Set "after", "key", or both',
    })
    .meta({
        description:
            "A way to move on from a screen without a link: after a delay, at a key press, or both",
    })
    .transform(
        ({ after, key, if: condition, action }): NextRule => ({
            ...(after === undefined ? {} : { after }),
            ...(condition === undefined ? {} : { if: condition }),
            ...(key === undefined
                ? {}
                : { keys: (Array.isArray(key) ? key : [key]).map(normalizeKey) }),
            action,
        }),
    );

export const NextSchema = z
    .union([RuleSchema, z.array(RuleSchema).min(1)])
    .transform((next) => (Array.isArray(next) ? next : [next]))
    .meta({
        description:
            "Moves on without a link: after a delay, at a key press, or both. One rule, or a list " +
            "where the first rule to trigger wins. With empty content and full-opacity static, " +
            "this makes a burst of noise between screens.",
    });

export interface NextRule {
    after?: number;
    /** Normalized key names (see normalizeKey), possibly including "any". */
    keys?: string[];
    /** Only while this holds. */
    if?: Condition;
    action: Action;
}

/** Whether a key press (a KeyboardEvent.key) matches normalized key names, including "any". */
export function keyMatches(keys: readonly string[], key: string): boolean {
    const pressed = normalizeKey(key);
    return keys.includes(pressed) || (keys.includes("any") && !NOT_ANY.has(pressed));
}

/** The rule a key press triggers, if any. `key` is a KeyboardEvent.key value. */
export function ruleForKey(rules: readonly NextRule[], key: string): NextRule | undefined {
    return rules.find((rule) => rule.keys && keyMatches(rule.keys, key));
}

/**
 * The rule a tap or click triggers. Touch screens have no keys, so a tap stands in for
 * one, as long as that's unambiguous: every rule with keys must lead to the same place.
 */
export function ruleForTap(rules: readonly NextRule[]): NextRule | undefined {
    const keyed = rules.filter((rule) => rule.keys);
    const [first] = keyed;
    const same = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);
    return first && keyed.every((rule) => same(rule.action, first.action)) ? first : undefined;
}

/** The timed rule that fires first, if any. */
export function firstTimedRule(rules: readonly NextRule[]): NextRule | undefined {
    return rules
        .filter((rule) => rule.after !== undefined)
        .reduce<NextRule | undefined>(
            (first, rule) => (first && (first.after ?? 0) <= (rule.after ?? 0) ? first : rule),
            undefined,
        );
}
