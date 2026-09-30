import { z } from "zod";
import {
    ChecklistItemSchema,
    DEFAULT_CHECKLIST_STATUS,
} from "../../modules/checklist/definition.ts";
import { ActionSchema, IdSchema } from "./common.ts";
import { ContentSchema } from "./elements.ts";
import type { NextRule } from "./next.ts";

// Presets are ready-made screens: a few settings, expanded into ordinary content (and a
// `next` rule) when the program is parsed. Anything a preset does can be written by hand.

export const BOOT_DEFAULTS = {
    title: "TELETRONIX SYSTEM BIOS v1.0",
    copyright: "(C) 1984 TELETRONIX CORPORATION",
    memory: { size: 640, label: "MEMORY TEST: ", unit: "K", done: " OK" },
    checks: [
        "DETECTING DRIVES",
        "LOADING KERNEL",
        "MOUNTING FILE SYSTEMS",
        "STARTING NETWORK",
        "STARTING TERMINAL SERVICES",
    ],
    ready: "BOOT COMPLETE.",
    pause: "PRESS ANY KEY TO CONTINUE",
    after: 1000,
};

const Line = (what: string, fallback: string) =>
    z
        .union([z.string(), z.literal(false)])
        .default(fallback)
        .meta({ description: `${what}, or false for none (default: "${fallback}")` });

export const MemorySchema = z
    .strictObject({
        size: z
            .int()
            .positive()
            .default(BOOT_DEFAULTS.memory.size)
            .meta({
                description: `How much memory it counts up to (default: ${BOOT_DEFAULTS.memory.size})`,
            }),
        label: z
            .string()
            .default(BOOT_DEFAULTS.memory.label)
            .meta({
                description: `Text before the number (default: "${BOOT_DEFAULTS.memory.label}")`,
            }),
        unit: z
            .string()
            .default(BOOT_DEFAULTS.memory.unit)
            .meta({
                description: `Text after the number (default: "${BOOT_DEFAULTS.memory.unit}")`,
            }),
        done: z
            .string()
            .default(BOOT_DEFAULTS.memory.done)
            .meta({
                description: `Text added once it's counted (default: "${BOOT_DEFAULTS.memory.done}")`,
            }),
    })
    .meta({ description: "The memory test's size and wording" });

export const BootPresetSchema = z
    .strictObject({
        type: z.literal("boot"),
        title: Line("The first line", BOOT_DEFAULTS.title),
        copyright: Line("The line under it", BOOT_DEFAULTS.copyright),
        memory: z
            .union([
                z
                    .int()
                    .positive()
                    .transform((size) => MemorySchema.parse({ size })),
                MemorySchema,
                z.literal(false),
            ])
            .default(MemorySchema.parse({}))
            .meta({
                description:
                    "A memory test that counts up: the size to count to, " +
                    '{ "size", "label", "unit", "done" } to change its wording too, or false for ' +
                    `none (default: ${BOOT_DEFAULTS.memory.size})`,
            }),
        checks: z
            .union([z.array(ChecklistItemSchema).min(1), z.literal(false)])
            .default(BOOT_DEFAULTS.checks)
            .meta({
                description:
                    "The checklist of things it starts: strings, or checklist items with their own " +
                    '"status" or "delay", or false for none',
            }),
        status: z
            .string()
            .default(DEFAULT_CHECKLIST_STATUS)
            .meta({
                description: `Each check's status (default: "${DEFAULT_CHECKLIST_STATUS}")`,
            }),
        ready: Line("The line once it has finished", BOOT_DEFAULTS.ready),
        pause: z
            .union([z.boolean(), z.string().min(1)])
            .default(false)
            .meta({
                description:
                    "Wait for a key press (or a tap) at the end, with a line of text: true for " +
                    `"${BOOT_DEFAULTS.pause}", or the text to show (default: false). Browsers only ` +
                    "play sound once the player has pressed a key or clicked, so this lets the " +
                    "next screen start with sound.",
            }),
        next: IdSchema.optional().meta({
            description: "The screen to go to once it has finished (default: stay)",
        }),
        after: z
            .number()
            .min(0)
            .optional()
            .meta({
                description:
                    "Milliseconds to wait before going to `next` (default: " +
                    `${BOOT_DEFAULTS.after}, or 0 after a pause)`,
            }),
    })
    .meta({
        description:
            "A computer starting up: a title, a memory test, a checklist of things starting, " +
            "then on to the next screen",
    });

export const PresetSchema = z
    .discriminatedUnion("type", [BootPresetSchema])
    .meta({ description: "A ready-made screen, with a few settings of its own" });

export type Preset = z.output<typeof PresetSchema>;

export interface Expanded {
    /** Content to go before the screen's own (as written, not yet parsed). */
    before: unknown[];
    /** Content to go after the screen's own. */
    after: unknown[];
    next?: NextRule;
}

/** A preset as ordinary content, and the rule that moves on from it. */
export function expandPreset(preset: Preset): Expanded {
    const before: unknown[] = [];
    const header = [preset.title, preset.copyright].filter((line) => line !== false);
    before.push(...header);
    if (preset.memory) {
        if (before.length > 0) before.push("");
        const { size, label, unit, done } = preset.memory;
        before.push({ type: "counter", label, to: size, step: 1, unit, done });
    }
    if (preset.checks) {
        if (before.length > 0) before.push("");
        before.push({ type: "checklist", items: preset.checks, status: preset.status });
    }
    if (preset.ready !== false) {
        if (before.length > 0) before.push("");
        before.push(preset.ready);
    }

    const after: unknown[] = [];
    if (preset.pause !== false) {
        after.push("", {
            type: "pause",
            text: preset.pause === true ? BOOT_DEFAULTS.pause : preset.pause,
        });
    }
    const wait = preset.after ?? (preset.pause !== false ? 0 : BOOT_DEFAULTS.after);
    const next =
        preset.next === undefined
            ? undefined
            : { after: wait, action: ActionSchema.parse({ screen: preset.next }) };
    return { before, after, next };
}

/** Content written for a preset, parsed like any screen's: bare strings stay strings. */
export const parseContent = (content: unknown[]) => z.array(ContentSchema).parse(content);
