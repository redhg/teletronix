import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { createTimedReveal } from "../../engine/reveal/index.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";
import { type Condition, VariableNameSchema } from "../../engine/schema/variables.ts";

export const VISUAL_KINDS = ["waveform", "chart", "radar", "wireframe"] as const;
export const WAVES = ["sine", "square", "saw", "triangle", "noise"] as const;
export const SHAPES = ["cube", "pyramid", "octahedron", "icosahedron", "torus", "terrain"] as const;

/** Milliseconds a visual takes to warm up as it appears. */
export const WARM_UP = 600;

const DEFAULT_ALT: Record<(typeof VISUAL_KINDS)[number], string> = {
    waveform: "An oscilloscope trace",
    chart: "A chart, scrolling",
    radar: "A radar sweep",
    wireframe: "A wireframe shape, turning",
};

export const VisualLevelSchema = z
    .strictObject({
        variable: VariableNameSchema.meta({ description: "The number variable it follows" }),
        min: z.number().default(0).meta({ description: "Its lowest value (default: 0)" }),
        max: z.number().default(100).meta({ description: "Its highest value (default: 100)" }),
    })
    .meta({ description: "A number variable a visual follows, and its range" });

export const VisualSchema = z
    .strictObject({
        type: z.literal("visual"),
        kind: z.enum(VISUAL_KINDS).meta({
            description:
                'What it shows: "waveform" (an oscilloscope trace), "chart" (scrolling telemetry), ' +
                '"radar" (a sweep with blips) or "wireframe" (a turning 3D shape)',
        }),
        cols: z
            .int()
            .min(1)
            .optional()
            .meta({
                description:
                    "Its width in character columns; on a narrower screen, it shrinks to fit " +
                    "(default: the screen's width)",
            }),
        rows: z.int().min(1).default(8).meta({ description: "Its height in lines (default: 8)" }),
        alt: z.string().min(1).optional().meta({
            description: "A description, for screen readers (default: one for its kind)",
        }),
        speed: z
            .number()
            .positive()
            .default(1)
            .meta({ description: "How fast it moves: 2 is twice as fast (default: 1)" }),
        grid: z.boolean().default(true).meta({
            description: "Draw a faint grid behind a waveform or chart (default: true)",
        }),
        wave: z
            .union([z.enum(WAVES), z.array(z.enum(WAVES)).min(1)])
            .default("sine")
            .transform((wave) => (Array.isArray(wave) ? wave : [wave]))
            .meta({
                description:
                    'A waveform\'s shape: "sine", "square", "saw", "triangle" or "noise", or a list ' +
                    'of them added together (default: "sine")',
            }),
        frequency: z.number().positive().default(2).meta({
            description: "A waveform's cycles across its width (default: 2)",
        }),
        amplitude: z.number().min(0).max(1).default(0.7).meta({
            description: "A waveform's height, from 0 (flat) to 1 (edge to edge) (default: 0.7)",
        }),
        style: z.enum(["line", "bars"]).default("line").meta({
            description: 'A chart\'s look: "line" or "bars" (default: "line")',
        }),
        volatility: z.number().min(0).max(1).default(0.3).meta({
            description: "How wildly a chart's values jump, from 0 to 1 (default: 0.3)",
        }),
        blips: z.int().min(0).default(5).meta({
            description: "How many blips a radar shows (default: 5)",
        }),
        shape: z
            .enum(SHAPES)
            .default("cube")
            .meta({
                description:
                    'A wireframe\'s shape: "cube", "pyramid", "octahedron", "icosahedron", "torus", or ' +
                    '"terrain" (a landscape flying past) (default: "cube")',
            }),
        level: VisualLevelSchema.optional().meta({
            description:
                "A number variable it follows as it changes: a waveform's height, the level a " +
                "chart wanders around, how many blips a radar shows, or how fast a wireframe turns",
        }),
        ...ElementBaseShape,
    })
    .meta({
        description:
            "Line art that moves, drawn in the screen's colors: an oscilloscope, a chart, a radar " +
            "or a turning wireframe shape. Pure decoration: it goes on until the screen does.",
    });

export type VisualElement = z.output<typeof VisualSchema> & ElementIdentity;

export const visualAlt = (visual: VisualElement) => visual.alt ?? DEFAULT_ALT[visual.kind];

/** Where a level's variable is between its min and max, from 0 to 1. */
export function levelOf(visual: VisualElement, value: unknown): number | null {
    if (!visual.level || typeof value !== "number") return null;
    const { min, max } = visual.level;
    return max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export const visualModule: ModuleDefinition<VisualElement> = {
    // (a level's variable: checked like a test of it, so it must be a number)
    conditions: (visual): Condition[] =>
        visual.level ? [{ variable: visual.level.variable, atLeast: 0 }] : [],
    text: () => "",
    reveal: (_visual, _spec, context) => createTimedReveal(context.instant ? 0 : WARM_UP),
};
