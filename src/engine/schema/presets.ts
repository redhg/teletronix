import { z } from "zod";
import {
    ChecklistItemSchema,
    DEFAULT_CHECKLIST_STATUS,
} from "../../modules/checklist/definition.ts";
import { DEFAULT_CRASH_MESSAGE } from "../../modules/crash/definition.ts";
import { HighlightSchema } from "../../modules/hexdump/definition.ts";
import { AccountSchema } from "../../modules/login/definition.ts";
import type { BarLine } from "./bars.ts";
import { ActionSchema, IdSchema } from "./common.ts";
import { ContentSchema } from "./elements.ts";
import type { NextRule } from "./next.ts";
import { VariableNameSchema } from "./variables.ts";

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

export const SHUTDOWN_DEFAULTS = {
    title: "SHUTTING DOWN...",
    checks: ["SAVING SESSION", "STOPPING SERVICES", "UNMOUNTING FILE SYSTEMS"],
    message: "IT IS NOW SAFE TO TURN OFF YOUR COMPUTER.",
    after: 1500,
    restart: "PRESS ANY KEY TO SWITCH ON",
};

const NextScreenSchema = IdSchema.optional().meta({
    description: "The screen to go to after the key press (default: the program's start screen)",
});

export const ShutdownPresetSchema = z
    .strictObject({
        type: z.literal("shutdown"),
        title: Line("The first line", SHUTDOWN_DEFAULTS.title),
        checks: z
            .union([z.array(ChecklistItemSchema).min(1), z.literal(false)])
            .default(SHUTDOWN_DEFAULTS.checks)
            .meta({
                description:
                    "The checklist of things it stops: strings, or checklist items with their own " +
                    '"status" or "delay", or false for none',
            }),
        status: z
            .string()
            .default(DEFAULT_CHECKLIST_STATUS)
            .meta({
                description: `Each check's status (default: "${DEFAULT_CHECKLIST_STATUS}")`,
            }),
        message: Line("The last line", SHUTDOWN_DEFAULTS.message),
        powerOff: z
            .boolean()
            .default(true)
            .meta({
                description:
                    "Switch the screen off at the end, like an old CRT: the picture collapses to a " +
                    "line, then a dot (default: true)",
            }),
        after: z
            .number()
            .min(0)
            .default(SHUTDOWN_DEFAULTS.after)
            .meta({
                description: `Milliseconds before it switches off (default: ${SHUTDOWN_DEFAULTS.after})`,
            }),
        restart: z
            .union([z.string().min(1), z.literal(false)])
            .default(SHUTDOWN_DEFAULTS.restart)
            .meta({
                description:
                    "Wait for a key press (or a tap) to switch back on, going to `next`; the " +
                    "text is shown if it doesn't switch off, and read out by screen readers if it " +
                    `does. Or false to stay off for good (default: "${SHUTDOWN_DEFAULTS.restart}")`,
            }),
        next: NextScreenSchema,
    })
    .meta({
        description:
            "A computer shutting down: a checklist of things stopping, a last message, then the " +
            "screen switches off until a key press",
    });

export const ERROR_DEFAULTS = {
    title: "SOFTWARE FAILURE",
    message: "THE SYSTEM HAS STOPPED TO PREVENT DAMAGE.",
    code: "GURU MEDITATION #00000004.0000AAC0",
    restart: "PRESS ANY KEY TO RESTART",
};

export const ErrorPresetSchema = z
    .strictObject({
        type: z.literal("error"),
        title: Line("The first line in the box", ERROR_DEFAULTS.title),
        message: z
            .union([z.string(), z.array(z.string()).min(1), z.literal(false)])
            .default(ERROR_DEFAULTS.message)
            .meta({
                description:
                    "What went wrong: a line, a list of lines, or false for none (default: " +
                    `"${ERROR_DEFAULTS.message}")`,
            }),
        code: Line("An error code, last in the box", ERROR_DEFAULTS.code),
        restart: z
            .union([z.string().min(1), z.literal(false)])
            .default(ERROR_DEFAULTS.restart)
            .meta({
                description:
                    "Wait for a key press (or a tap), showing this, then go to `next`; or false to " +
                    `stay for good (default: "${ERROR_DEFAULTS.restart}")`,
            }),
        next: NextScreenSchema,
    })
    .meta({
        description:
            "A fatal error, in the alert color: a message and a code in a blinking box, like an " +
            "Amiga's Guru Meditation, then a key press to restart",
    });

export const CRASH_DEFAULTS = { restart: "PRESS ANY KEY TO RESTART" };

export const CrashPresetSchema = z
    .strictObject({
        type: z.literal("crash"),
        message: z
            .union([z.string(), z.array(z.string()).min(1)])
            .optional()
            .meta({
                description:
                    "A message that surfaces through the noise now and then: a line or a list of " +
                    `lines (default: "${DEFAULT_CRASH_MESSAGE}")`,
            }),
        fragments: z
            .array(z.string().min(1))
            .optional()
            .meta({
                description:
                    "Bits of text scattered through the noise (default: the lines of the screen " +
                    "before, as if it had broken apart)",
            }),
        next: IdSchema.optional().meta({
            description:
                "A screen that a key press (or a tap) restarts to (default: none: the crash " +
                "goes on for good)",
        }),
        restart: z
            .string()
            .min(1)
            .default(CRASH_DEFAULTS.restart)
            .meta({
                description:
                    "With `next`, what screen readers hear as it waits for the key (the noise " +
                    `hides it on screen) (default: "${CRASH_DEFAULTS.restart}")`,
            }),
    })
    .meta({
        description:
            "A computer that has crashed: the whole window fills with garbage that never stops " +
            "changing, with a message surfacing through it. Optionally, a key press restarts.",
    });

export const HEXEDITOR_DEFAULTS = {
    title: "HEXEDIT 2.1",
    file: "UNTITLED.BIN",
    status: "OFFSET {offset}   BYTE {byte}   {size} BYTES   READ ONLY",
    exit: "ESC: EXIT",
};

export const HexeditorPresetSchema = z
    .strictObject({
        type: z.literal("hexeditor"),
        title: z
            .string()
            .default(HEXEDITOR_DEFAULTS.title)
            .meta({
                description: `The editor's name, at the left of its header bar (default: "${HEXEDITOR_DEFAULTS.title}")`,
            }),
        file: z
            .string()
            .default(HEXEDITOR_DEFAULTS.file)
            .meta({
                description: `The file's name, after it (default: "${HEXEDITOR_DEFAULTS.file}")`,
            }),
        status: z
            .string()
            .default(HEXEDITOR_DEFAULTS.status)
            .meta({
                description:
                    "The status line under the bytes: {offset} is the cursor's address, {byte} the " +
                    `byte there, and {size} the number of bytes (default: "${HEXEDITOR_DEFAULTS.status}")`,
            }),
        exit: z
            .string()
            .default(HEXEDITOR_DEFAULTS.exit)
            .meta({
                description:
                    "A link at the right of the header bar that leaves, as <esc> does " +
                    `(default: "${HEXEDITOR_DEFAULTS.exit}")`,
            }),
        next: IdSchema.optional().meta({
            description: "The screen to go to on leaving (default: the program's start screen)",
        }),
        // the rest is the hex dump's
        text: z
            .union([z.string(), z.array(z.string()).min(1)])
            .optional()
            .meta({
                description: 'Text to show as bytes. With "size", it\'s hidden among random bytes.',
            }),
        src: z.string().min(1).optional().meta({ description: "A file to show instead" }),
        size: z.int().min(1).max(65_536).optional().meta({
            description: 'This many random bytes, with the "text" (if any) hidden among them',
        }),
        at: z.int().min(0).optional().meta({
            description: 'Where the "text" goes among the random bytes',
        }),
        offset: z.int().min(0).optional().meta({
            description: "The address shown for the first byte (default: 0)",
        }),
        highlight: z.array(HighlightSchema).optional().meta({
            description: 'Bytes to draw in the alert color: some text, or { "from", "to" }',
        }),
        lowercase: z.boolean().optional().meta({
            description: "Lowercase hex digits (default: false)",
        }),
        autoscroll: z
            .union([z.boolean(), z.number().positive()])
            .optional()
            .meta({
                description:
                    "Move the cursor down through the bytes by itself: true, or the rows per " +
                    "second (true is 4), until the player takes over; Shift+Up or Shift+Down stops " +
                    "it, and then scrolls up or down (default: false)",
            }),
        loop: z.boolean().optional().meta({
            description: "Start again from the top when autoscroll reaches the end (default: true)",
        }),
        stopAt: z.literal("highlight").optional().meta({
            description:
                'Stop autoscroll when the first highlighted bytes come into view: "highlight"',
        }),
    })
    .meta({
        description:
            "A hex editor, for looking only: a file's bytes filling the screen, a cursor to move " +
            "through them with the arrow keys, and a status line. <esc> leaves.",
    });

export const LOGIN_PRESET_DEFAULTS = {
    title: "AUTHORIZED PERSONNEL ONLY",
    granted: "ACCESS GRANTED.",
};

export const LoginPresetSchema = z
    .strictObject({
        type: z.literal("login"),
        title: Line("A line above the login, in the alert color", LOGIN_PRESET_DEFAULTS.title),
        accounts: z.array(AccountSchema).min(1).meta({
            description: "The usernames and passwords that log in",
        }),
        next: IdSchema.optional().meta({
            description:
                "The screen to go to on logging in, for accounts without an action of their " +
                "own (default: the program's start screen)",
        }),
        granted: Line("Shown on logging in, before going on", LOGIN_PRESET_DEFAULTS.granted),
        lockout: IdSchema.optional().meta({
            description: "A screen to go to when too many wrong tries lock it (with attempts)",
        }),
        // the rest is the login's
        username: z
            .union([z.string(), z.literal(false)])
            .optional()
            .meta({
                description:
                    'The username prompt, or false to ask for a password only (default: "USERNAME: ")',
            }),
        password: z
            .string()
            .optional()
            .meta({ description: 'The password prompt (default: "PASSWORD: ")' }),
        attempts: z.int().min(1).optional().meta({
            description: "How many wrong tries it takes to lock the terminal (default: no limit)",
        }),
        denied: z.string().optional().meta({ description: "Shown after a wrong try" }),
        remaining: z.string().optional().meta({
            description: "With attempts, shown after denied: {n} is how many tries are left",
        }),
        locked: z.string().optional().meta({ description: "Shown once it's locked" }),
        variable: VariableNameSchema.optional().meta({
            description: "A text variable that gets the username, on logging in",
        }),
    })
    .meta({
        description:
            "A login screen: a line of warning, then a username and password checked against " +
            "its accounts, with an optional limit on wrong tries",
    });

export const DECRYPT_DEFAULTS = {
    title: "INTERCEPTED TRANSMISSION. DECRYPTING...",
    bar: "DECRYPTING ",
    after: 1500,
};

export const DecryptPresetSchema = z
    .strictObject({
        type: z.literal("decrypt"),
        title: Line("A line above the message", DECRYPT_DEFAULTS.title),
        text: z
            .union([z.string().min(1), z.array(z.string()).min(1)])
            .meta({ description: "The message it decrypts: a string, or a list of lines" }),
        bar: z
            .union([z.string(), z.literal(false)])
            .default(DECRYPT_DEFAULTS.bar)
            .meta({
                description: `The progress bar's label, or false for no bar (default: "${DECRYPT_DEFAULTS.bar}")`,
            }),
        next: IdSchema.optional().meta({
            description: "The screen to go to once it has decrypted (default: stay)",
        }),
        failNext: IdSchema.optional().meta({
            description: "With failAt, the screen to go to when it fails (default: stay)",
        }),
        after: z
            .number()
            .min(0)
            .default(DECRYPT_DEFAULTS.after)
            .meta({
                description: `Milliseconds before going on (default: ${DECRYPT_DEFAULTS.after})`,
            }),
        // the rest is the decrypt element's
        duration: z.number().positive().optional().meta({
            description: "Milliseconds it takes to decrypt (default: 3000)",
        }),
        charset: z.string().min(2).optional().meta({
            description:
                'The characters it scrambles with: "symbols", "hex", "binary", "letters", or your own',
        }),
        order: z.enum(["random", "sweep"]).optional().meta({
            description: 'Which characters come right first: "random" or "sweep"',
        }),
        failAt: z.number().min(0).max(100).optional().meta({
            description: "Stop at this percentage, leaving the rest scrambled: it fails",
        }),
        done: z.string().optional().meta({
            description: 'Shown in place of the percentage at the end (default: "COMPLETE")',
        }),
        failed: z.string().optional().meta({
            description: 'Shown in place of the percentage when it fails (default: "FAILED")',
        }),
    })
    .meta({
        description:
            "A message decrypting: scrambled characters resolving a few at a time, with a " +
            "progress bar, then on to the next screen. It can fail partway.",
    });

export const COUNTDOWN_DEFAULTS = {
    title: "*** SELF-DESTRUCT SEQUENCE ACTIVATED ***",
    message: "ALL PERSONNEL EVACUATE IMMEDIATELY.",
    seconds: 60,
    label: "T-MINUS",
    prompt: "ABORT CODE: ",
    wrong: "INVALID CODE.",
};

export const CountdownPresetSchema = z
    .strictObject({
        type: z.literal("countdown"),
        title: Line("A warning, blinking in the alert color", COUNTDOWN_DEFAULTS.title),
        message: Line("A line under it", COUNTDOWN_DEFAULTS.message),
        seconds: z
            .number()
            .positive()
            .default(COUNTDOWN_DEFAULTS.seconds)
            .meta({
                description: `Seconds it counts down from (default: ${COUNTDOWN_DEFAULTS.seconds})`,
            }),
        label: z
            .string()
            .default(COUNTDOWN_DEFAULTS.label)
            .meta({
                description: `A line above the time (default: "${COUNTDOWN_DEFAULTS.label}")`,
            }),
        format: z.enum(["mm:ss", "hh:mm:ss", "ss"]).default("mm:ss").meta({
            description: 'How the time is shown: "mm:ss", "hh:mm:ss" or "ss" (default: "mm:ss")',
        }),
        big: z.boolean().default(true).meta({
            description: "Show the time in big block digits (default: true)",
        }),
        next: IdSchema.optional().meta({
            description:
                "The screen to go to when it reaches zero (default: the program's start screen)",
        }),
        code: z.int().min(0).optional().meta({
            description:
                "A number that aborts it, typed at a prompt under the time (default: none)",
        }),
        aborted: IdSchema.optional().meta({
            description:
                "With code, the screen to go to once it's aborted (default: the program's start screen)",
        }),
        prompt: z
            .string()
            .default(COUNTDOWN_DEFAULTS.prompt)
            .meta({
                description: `With code, the prompt (default: "${COUNTDOWN_DEFAULTS.prompt}")`,
            }),
        wrong: z
            .string()
            .default(COUNTDOWN_DEFAULTS.wrong)
            .meta({
                description: `With code, shown after a wrong one (default: "${COUNTDOWN_DEFAULTS.wrong}")`,
            }),
    })
    .meta({
        description:
            "A self-destruct countdown: a blinking warning, the time in big digits, and an " +
            "optional abort code. At zero, it goes to next; the right code goes to aborted.",
    });

export const PresetSchema = z
    .discriminatedUnion("type", [
        BootPresetSchema,
        ShutdownPresetSchema,
        ErrorPresetSchema,
        CrashPresetSchema,
        HexeditorPresetSchema,
        LoginPresetSchema,
        DecryptPresetSchema,
        CountdownPresetSchema,
    ])
    .meta({ description: "A ready-made screen, with a few settings of its own" });

export type Preset = z.output<typeof PresetSchema>;

export interface Expanded {
    /** Content to go before the screen's own (as written, not yet parsed). */
    before: unknown[];
    /** Content to go after the screen's own. */
    after: unknown[];
    next?: NextRule;
    /** A header bar for the screen, unless it has its own. */
    header?: BarLine[];
    /** A status bar for the screen (or false for none), unless it has its own. */
    footer?: BarLine[] | false;
}

/** Lines with a blank line between each group, leaving out empty groups. */
function spaced(...groups: unknown[][]): unknown[] {
    return groups
        .filter((group) => group.length > 0)
        .flatMap((group, i) => (i === 0 ? group : ["", ...group]));
}

const goTo = (screen: string, after = 0): NextRule => ({
    after,
    action: ActionSchema.parse({ screen }),
});

/**
 * A preset as ordinary content, and the rule that moves on from it. `start` is the program's
 * start screen, where some presets go by default.
 */
export function expandPreset(preset: Preset, start: string): Expanded {
    const line = (text: string | false) => (text === false ? [] : [text]);
    const checklist = (checks: unknown[] | false, status: string) =>
        checks ? [{ type: "checklist", items: checks, status }] : [];

    switch (preset.type) {
        case "boot": {
            const header = [...line(preset.title), ...line(preset.copyright)];
            const memory = preset.memory
                ? [
                      {
                          type: "counter",
                          label: preset.memory.label,
                          to: preset.memory.size,
                          unit: preset.memory.unit,
                          done: preset.memory.done,
                      },
                  ]
                : [];
            const pause =
                preset.pause === false
                    ? []
                    : [
                          "",
                          {
                              type: "pause",
                              text: preset.pause === true ? BOOT_DEFAULTS.pause : preset.pause,
                          },
                      ];
            const wait = preset.after ?? (preset.pause !== false ? 0 : BOOT_DEFAULTS.after);
            return {
                before: spaced(
                    header,
                    memory,
                    checklist(preset.checks, preset.status),
                    line(preset.ready),
                ),
                after: pause,
                next: preset.next === undefined ? undefined : goTo(preset.next, wait),
            };
        }
        case "shutdown": {
            const off = preset.powerOff ? [{ type: "power-off", delay: preset.after }] : [];
            // after switching off it's dark, but the pause is still there for screen readers
            const restart =
                preset.restart === false ? [] : [{ type: "pause", text: preset.restart }];
            return {
                before: spaced(
                    line(preset.title),
                    checklist(preset.checks, preset.status),
                    line(preset.message),
                ),
                after: [
                    ...off,
                    ...(off.length === 0 && restart.length > 0 ? [""] : []),
                    ...restart,
                ],
                next: preset.restart === false ? undefined : goTo(preset.next ?? start),
            };
        }
        case "error": {
            const message =
                preset.message === false
                    ? []
                    : Array.isArray(preset.message)
                      ? preset.message
                      : [preset.message];
            const lines = spaced(line(preset.title), message, line(preset.code)) as string[];
            // each line centered within the block, which is centered on the screen
            const widest = Math.max(0, ...lines.map((text) => text.length));
            const box = lines.map((text) =>
                text === "" ? text : " ".repeat(Math.floor((widest - text.length) / 2)) + text,
            );
            return {
                before:
                    box.length > 0
                        ? [
                              {
                                  type: "text",
                                  text: box,
                                  align: "center",
                                  className: "alert error-box",
                              },
                          ]
                        : [],
                after:
                    preset.restart === false
                        ? []
                        : [
                              "",
                              {
                                  type: "pause",
                                  text: preset.restart,
                                  align: "center",
                                  className: "alert",
                              },
                          ],
                next: preset.restart === false ? undefined : goTo(preset.next ?? start),
            };
        }
        case "crash": {
            const crash = {
                type: "crash",
                ...(preset.message === undefined ? {} : { message: preset.message }),
                ...(preset.fragments === undefined ? {} : { fragments: preset.fragments }),
            };
            const restart =
                preset.next === undefined ? [] : [{ type: "pause", text: preset.restart }];
            return {
                before: [crash],
                after: restart,
                next: preset.next === undefined ? undefined : goTo(preset.next),
            };
        }
        case "login": {
            const { type: _, title, next, granted, lockout, ...login } = preset;
            return {
                before: [
                    ...(title === false
                        ? []
                        : [{ type: "text", text: title, className: "alert" }, ""]),
                    {
                        type: "login",
                        ...login,
                        action: { screen: next ?? start },
                        ...(granted === false ? {} : { granted }),
                        ...(lockout === undefined ? {} : { onLocked: { screen: lockout } }),
                    },
                ],
                after: [],
            };
        }
        case "decrypt": {
            const { type: _, title, bar, next, failNext, after, ...decrypt } = preset;
            const goOn = (screen: string | undefined) =>
                screen === undefined ? {} : { after, action: { screen } };
            const onComplete = goOn(next);
            const onFail = goOn(failNext);
            return {
                before: [
                    ...(title === false ? [] : [title, ""]),
                    {
                        type: "decrypt",
                        ...decrypt,
                        ...(bar === false ? {} : { bar }),
                        ...("action" in onComplete ? { onComplete } : {}),
                        ...("action" in onFail ? { onFail } : {}),
                    },
                ],
                after: [],
            };
        }
        case "countdown": {
            const abort =
                preset.code === undefined
                    ? []
                    : [
                          "",
                          {
                              type: "number",
                              prompt: preset.prompt,
                              digits: Math.max(1, String(preset.code).length),
                              on: [
                                  {
                                      equals: preset.code,
                                      action: { screen: preset.aborted ?? start },
                                  },
                              ],
                              unknown: preset.wrong,
                          },
                      ];
            return {
                before: [
                    ...(preset.title === false
                        ? []
                        : [{ type: "text", text: preset.title, className: "alert blink" }, ""]),
                    ...(preset.message === false ? [] : [preset.message, ""]),
                    {
                        type: "timer",
                        label: preset.label ? `${preset.label} ` : "",
                        from: preset.seconds,
                        to: 0,
                        format: preset.format,
                        big: preset.big,
                        className: "alert",
                        onComplete: { screen: preset.next ?? start },
                    },
                    ...abort,
                ],
                after: [],
            };
        }
        case "hexeditor": {
            const { type: _, title, file, exit, next, ...dump } = preset;
            const leave = ActionSchema.parse({ screen: next ?? start });
            return {
                before: [
                    {
                        type: "hexdump",
                        rows: "fill",
                        statusBar: true,
                        ...dump,
                        exit: { key: "Escape", action: { screen: next ?? start } },
                    },
                ],
                after: [],
                // (the dump draws its own status bar, in place of the program's)
                footer: false,
                header: [
                    {
                        left: { text: `${title}  ${file}`.trim() },
                        ...(exit ? { right: { text: exit, action: leave } } : {}),
                    },
                ],
            };
        }
    }
}

/** Content written for a preset, parsed like any screen's: bare strings stay strings. */
export const parseContent = (content: unknown[]) => z.array(ContentSchema).parse(content);
