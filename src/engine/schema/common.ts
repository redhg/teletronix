import { z } from "zod";
import { type Mosaic, MosaicViewSchema } from "../../modules/mosaic/tiles.ts";
import { AssignmentsSchema, ConditionSchema, VariableNameSchema } from "./variables.ts";

// ─── Ids ─────────────────────────────────────────────────────────────────────

export const IdSchema = z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, "Ids may only contain letters, digits, '_' and '-'")
    .meta({ description: "A screen or dialog id (letters, digits, '_' and '-')" });

// ─── Reveals ─────────────────────────────────────────────────────────────────
// How an element's text appears on screen. Authors can use a bare name
// ("teletype") or an object with per-reveal options.

export const TeletypeOptionsSchema = z
    .strictObject({
        speed: z
            .number()
            .positive()
            .optional()
            .meta({ description: "Milliseconds per character (default: 10)" }),
    })
    .meta({ description: "Default options for teletype reveals" });

export const GlitchOptionsSchema = z
    .strictObject({
        duration: z
            .number()
            .positive()
            .optional()
            .meta({ description: "Milliseconds a glitch takes (default: 1000)" }),
    })
    .meta({ description: "Default options for glitch reveals and transitions" });

export const TeletypeRevealSchema = TeletypeOptionsSchema.extend({
    type: z.literal("teletype"),
}).meta({ description: "Types the text one character at a time" });
export const GlitchRevealSchema = z
    .strictObject({
        type: z.literal("glitch"),
        duration: z.number().positive().optional().meta({
            description: "Milliseconds for the text to resolve (default: config.defaults.glitch)",
        }),
    })
    .meta({ description: "Resolves the text out of random glyphs, left to right" });
export const InstantRevealSchema = z
    .strictObject({ type: z.literal("instant") })
    .meta({ description: "Shows the text all at once" });

const RevealObjectSchema = z.discriminatedUnion("type", [
    TeletypeRevealSchema,
    GlitchRevealSchema,
    InstantRevealSchema,
]);

export const RevealSchema = z
    .union([z.enum(["teletype", "glitch", "instant"]), RevealObjectSchema])
    .transform((reveal) => (typeof reveal === "string" ? { type: reveal } : reveal))
    .meta({
        description:
            'How text appears: "teletype" (character by character), "glitch" (resolves out of ' +
            'random glyphs) or "instant" (all at once). Use an object to override options, e.g. ' +
            '{ "type": "teletype", "speed": 20 }. When a screen or the config sets "glitch", ' +
            "consecutive elements that don't set their own reveal glitch in together as one block.",
    });

/** A reveal as written by an author, normalized to object form. Options are partial. */
export type RevealOption = z.output<typeof RevealSchema>;

// ─── Transitions ─────────────────────────────────────────────────────────────
// How the previous screen leaves when a screen is shown.

export const GlitchTransitionSchema = z
    .strictObject({
        type: z.literal("glitch"),
        duration: z.number().positive().optional().meta({
            description:
                "Milliseconds for the old screen to erase (default: config.defaults.glitch)",
        }),
    })
    .meta({ description: "The old screen erases itself over the new one as it appears" });
export const NoneTransitionSchema = z
    .strictObject({ type: z.literal("none") })
    .meta({ description: "The old screen disappears at once" });
export const StaticTransitionSchema = z
    .strictObject({
        type: z.literal("static"),
        duration: z
            .number()
            .positive()
            .optional()
            .meta({ description: "Milliseconds of static (default: 120)" }),
    })
    .meta({
        description:
            "A brief burst of full-screen noise, like changing channels, before the new screen",
    });
export const FadeTransitionSchema = z
    .strictObject({
        type: z.literal("fade"),
        duration: z
            .number()
            .positive()
            .optional()
            .meta({ description: "Milliseconds to fade out (default: 600)" }),
    })
    .meta({ description: "The old screen fades out behind the new one, like phosphor afterglow" });

export const TransitionSchema = z
    .union([
        z.enum(["none", "glitch", "fade", "static"]),
        z.discriminatedUnion("type", [
            NoneTransitionSchema,
            GlitchTransitionSchema,
            FadeTransitionSchema,
            StaticTransitionSchema,
        ]),
    ])
    .transform(
        (transition): TransitionOption =>
            typeof transition === "string" ? { type: transition } : transition,
    )
    .meta({
        description:
            'How the previous screen leaves: "none" (it disappears at once), "glitch" (it erases ' +
            'itself over this screen while this screen reveals), "fade" (it fades out like ' +
            'phosphor afterglow) or "static" (a brief burst of full-screen noise, like changing ' +
            "channels, before this screen reveals)",
    });

/** A transition as written by an author, normalized to object form. Options are partial. */
export type TransitionOption =
    | { type: "none" }
    | { type: "glitch"; duration?: number }
    | { type: "fade"; duration?: number }
    | { type: "static"; duration?: number };

// ─── Alignment ───────────────────────────────────────────────────────────────

export const AlignSchema = z.enum(["left", "center", "right"]).meta({
    description:
        'Where the text sits across the screen: "left", "center" or "right". Centered and ' +
        "right-aligned text moves as one block, so its lines keep their shape (e.g. ASCII art): " +
        "the widest line decides where every line starts.",
});

/** An element's `align`. */
export const ElementAlignSchema = AlignSchema.optional().meta({
    description:
        'Where the text sits across the screen: "left", "center" or "right". Centered and ' +
        "right-aligned text moves as one block, so its lines keep their shape (e.g. ASCII " +
        'art): the widest line decides where every line starts (default: the screen\'s, or "left")',
});

// ─── Actions ─────────────────────────────────────────────────────────────────
// What an interactive element does. Shared by links, prompts and dialogs.

/** A sound from the program's `sounds`, by name. */
export const SoundNameSchema = IdSchema.meta({
    description: "The name of a sound in the program's sounds",
});

const actionSound = SoundNameSchema.optional().meta({
    description: "A sound from the program's sounds, played as the action happens",
});

export const ActionCaseSchema = z
    .strictObject({
        if: ConditionSchema.optional().meta({
            description: "Only when this holds; otherwise the next case in the list is tried",
        }),
        screen: z
            .union([IdSchema, z.array(IdSchema).min(1)])
            .optional()
            .meta({
                description: "A screen to go to, or a list of screens to go to one of, at random",
            }),
        dialog: z
            .union([IdSchema, z.array(IdSchema).min(1)])
            .optional()
            .meta({
                description: "A dialog to open, or a list of dialogs to open one of, at random",
            }),
        frame: IdSchema.optional().meta({
            description:
                "Show the screen in this frame on the current screen (see a frame's name), " +
                "instead of going to it. Without that frame there, it goes to the screen.",
        }),
        set: AssignmentsSchema.optional().meta({
            description: 'Variables to change first, e.g. { "keycard": true }',
        }),
        startTimer: VariableNameSchema.optional().meta({
            description: "A timer to start (or carry on, if it was stopped partway)",
        }),
        stopTimer: VariableNameSchema.optional().meta({
            description: "A timer to stop where it is",
        }),
        resetTimer: VariableNameSchema.optional().meta({
            description: "A timer to stop and put back to its start",
        }),
        sound: actionSound,
        // (a getter: a view's onEnd is an action, so the two refer to each other)
        get view() {
            return ViewSchema.optional().meta({
                description:
                    "An image or video to show over the whole window, until the player closes " +
                    "it (or a video ends, with onEnd)",
            });
        },
        back: z
            .literal(true)
            .optional()
            .meta({
                description:
                    "Go back to the screen before this one (and before that, each time), e.g. " +
                    "from a help screen many screens link to",
            }),
        restart: z
            .literal(true)
            .optional()
            .meta({
                description:
                    "Start the program over, as if just loaded: the start screen, with every " +
                    "variable, timer and element's memory (e.g. a locked login) back where it began",
            }),
    })
    .refine((action) => action.frame === undefined || action.screen !== undefined, {
        message: 'Showing something in a frame needs the "screen" to show',
    })
    .refine((action) => !(action.frame && (action.back || action.restart)), {
        message: 'A frame shows a screen: leave out "back" and "restart"',
    })
    .refine(
        (action) =>
            !(action.view && (action.screen || action.dialog || action.back || action.restart)),
        {
            message:
                'A view shows over the screen: leave out "screen", "dialog", "back" and "restart"',
        },
    )
    .refine((action) => !(action.screen && action.dialog), {
        message: 'Set "screen" or "dialog", not both',
    })
    .refine((action) => !(action.back && (action.screen || action.dialog || action.restart)), {
        message: 'Going back goes to the screen before: leave out "screen", "dialog" and "restart"',
    })
    .refine((action) => !(action.restart && (action.screen || action.dialog || action.set)), {
        message:
            'A restart goes to the start screen afresh: leave out "screen", "dialog" and "set"',
    })
    .refine(
        (action) =>
            action.screen !== undefined ||
            action.dialog !== undefined ||
            action.restart !== undefined ||
            action.back !== undefined ||
            action.set !== undefined ||
            action.sound !== undefined ||
            action.startTimer !== undefined ||
            action.stopTimer !== undefined ||
            action.resetTimer !== undefined ||
            action.view !== undefined,
        {
            message:
                'Set "screen", "dialog", "view", "set", "sound", "back", "restart" or a timer to start, stop or reset',
        },
    )
    .meta({
        description:
            "Go to a screen or open a dialog, changing variables and playing a sound on the way",
    });

export const ActionSchema = z
    .union([ActionCaseSchema, z.array(ActionCaseSchema).min(1)])
    .transform((action): Action => (Array.isArray(action) ? action : [action]))
    .meta({
        // named, so the JSON Schema refers to it (and the editor knows an action by it)
        id: "Action",
        description:
            "What happens: go to a screen, open a dialog, change variables, play a sound. Or a " +
            'list of these with "if" conditions, where the first whose condition holds happens.',
    });

/** One case of an action, normalized. */
export type ActionCase = z.output<typeof ActionCaseSchema>;

/** An action: cases, of which the first whose condition holds happens. */
export type Action = readonly ActionCase[];

// ─── Views ───────────────────────────────────────────────────────────────────
// An image or video over the whole window (an action's "view"), until the player closes it.

const VIDEO = /\.(mp4|m4v|webm|ogv|mov)(\?.*)?$/i;

/** What a view shows, filled in. */
export interface View {
    /** Its file ("" for a mosaic) */
    src: string;
    kind: "image" | "video" | "mosaic";
    /** For a mosaic: its tiles, and how they're laid out */
    mosaic?: Mosaic;
    /** "contain": all of it, with bars round it; "cover": the whole window, trimmed */
    fit: "contain" | "cover";
    loop: boolean;
    muted: boolean;
    caption?: string;
    /** A VCR's on-screen display: PLAY ► and a tape counter */
    osd: boolean;
    /** For a video: what happens when it ends (it closes first) */
    onEnd?: Action;
}

export const ViewOptionsSchema = z
    .strictObject({
        src: z
            .string()
            .min(1)
            .optional()
            .meta({
                description:
                    'An image or a video, relative to the page, e.g. "data/video/tape3.mp4", or a ' +
                    "web address. Videos are MP4 (which plays everywhere), WebM, M4V, OGV or MOV.",
            }),
        kind: z.enum(["image", "video"]).optional().meta({
            description: "Whether it's an image or a video (default: from the file's extension)",
        }),
        fit: z
            .enum(["contain", "cover"])
            .default("contain")
            .meta({
                description:
                    '"contain": all of it, with bars round it; "cover": the whole window, trimmed ' +
                    'to fit (default: "contain")',
            }),
        loop: z.boolean().default(false).meta({
            description: "Play a video over and over (default: false)",
        }),
        muted: z.boolean().default(false).meta({
            description: "Play a video without its sound (default: false)",
        }),
        caption: z.string().optional().meta({ description: "A line of text under it" }),
        osd: z
            .boolean()
            .default(false)
            .meta({
                description:
                    "A VCR's on-screen display, in the terminal's font: PLAY ► (or PAUSE) and a " +
                    "tape counter (default: false)",
            }),
        // (a getter: a mosaic's tiles have actions, which can show views)
        get mosaic() {
            return MosaicViewSchema.optional().meta({
                description:
                    "Several feeds at once, as a mosaic element shows them, in place of src",
            });
        },
        get onEnd() {
            return ActionSchema.optional().meta({
                description: "What happens when a video ends (it closes first)",
            });
        },
    })
    .refine((view) => (view.src === undefined) !== (view.mosaic === undefined), {
        message: 'Give it "src" (an image or video) or "mosaic", one or the other',
    })
    .meta({ description: "An image or video over the whole window, with its options" });

export const ViewSchema: z.ZodType<View> = z
    .union([z.string().min(1), ViewOptionsSchema])
    .transform((view): View => {
        const options = typeof view === "string" ? { src: view } : view;
        const { src, kind, fit, loop, muted, caption, osd, onEnd, mosaic } = options as {
            src?: string;
            mosaic?: Mosaic;
            kind?: "image" | "video";
            fit?: "contain" | "cover";
            loop?: boolean;
            muted?: boolean;
            caption?: string;
            osd?: boolean;
            onEnd?: Action;
        };
        return {
            src: src ?? "",
            kind: mosaic ? "mosaic" : (kind ?? (VIDEO.test(src ?? "") ? "video" : "image")),
            ...(mosaic ? { mosaic } : {}),
            fit: fit ?? "contain",
            loop: loop ?? false,
            muted: muted ?? false,
            ...(caption === undefined ? {} : { caption }),
            osd: osd ?? false,
            ...(onEnd === undefined ? {} : { onEnd }),
        };
    })
    .meta({
        id: "View",
        description:
            "An image or video over the whole window, until the player closes it: its file, " +
            'e.g. "data/images/photo.jpg", or { "src", … } with options',
    });

// ─── Element base ────────────────────────────────────────────────────────────

export const ElementBaseShape = {
    className: z
        .string()
        .optional()
        .meta({ description: 'Space-separated CSS classes, e.g. "alert"' }),
    reveal: RevealSchema.optional().meta({
        description: "How this element's text appears (default: the screen's reveal)",
    }),
    sound: SoundNameSchema.optional().meta({
        description: "A sound from the program's sounds, played as the element starts to appear",
    }),
    if: ConditionSchema.optional().meta({
        description: "Show the element only if this holds when the screen starts",
    }),
};
