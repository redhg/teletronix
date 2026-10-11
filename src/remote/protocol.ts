import type { EffectsSetting, VariableValue } from "../engine/index.ts";

// Messages between a GM's control panel (`&gm`) and the players' terminal. In two windows of
// the same browser, they go through a BroadcastChannel named after the program, so a panel
// controls every players' window of its program. A terminal with `&remote` can also be
// reached from other devices, through the server it's served from, by its pairing code
// (see link.ts and scripts/remote-relay.ts).

/** The channel for a program, by its name in the address (`?data=<name>`). */
export const channelName = (program: string) => `teletronix:remote:${program}`;

/** What the players' terminal is showing, as the panel sees it. */
export interface PlayerState {
    screen: string | null;
    /** The open dialog's id ("@transmission" for one the GM sent) */
    dialog: string | null;
    variables: Record<string, VariableValue>;
    timers: Record<string, { seconds: number | undefined; running: boolean }>;
    /** The audio file looping in the background, by its name in the program's sounds */
    ambience: string | null;
    /** The image or video over the whole window, by its file, if one's open */
    view: string | null;
    /** Whether the program's paused */
    paused: boolean;
}

/** From the panel to the players' terminal. */
export type GmMessage =
    /** Asks every players' window to send its state. */
    | { type: "hello" }
    /** The panel is still there (sent every so often). */
    | { type: "ping" }
    /** An action, as written in a program: go to a screen, open a dialog, set variables… */
    | { type: "action"; action: unknown }
    /** Effects laid over the program's, or null for none. */
    | { type: "effects"; effects: EffectsSetting | null }
    /** Ambience over the program's: an audio file, false for silence, or null for none. */
    | { type: "ambience"; ambience: string | false | null }
    /** An image or video over the whole window (as an action's "view" has it): a handout. */
    | { type: "view"; view: unknown }
    /** Closes the image or video. */
    | { type: "close-view" }
    /**
     * Plays a sound on the players' devices: one of the program's (by name), one of
     * Teletronix's own, or an audio file (by its address).
     */
    | { type: "play"; sound?: string; builtin?: BuiltinSound; src?: string }
    /** Closes the image or video showing, and stops the sounds playing. */
    | { type: "stop-media" }
    /** Pauses the program under a cover: a message, an image behind it, a sound looping. */
    | { type: "pause"; message?: string; image?: string; sound?: string }
    /** Carries on where it was paused. */
    | { type: "resume" }
    /** A burst of heavy static, for `ms` milliseconds. */
    | { type: "burst"; ms: number }
    /** A message, typed into a dialog. */
    | { type: "transmit"; text: string; dismiss?: string; alert?: boolean }
    /** Closes the open dialog, as if answered "no". */
    | { type: "close-dialog" }
    /**
     * To a players' window without the GM's package (see packages-share.ts): what it is, to
     * accept or not; or why the GM can't share it.
     */
    | {
          type: "package-offer";
          package: string;
          fileName: string;
          size: number;
          /** Where to download it from, if the GM shared it through Cloudflare (with a key) */
          url?: string;
      }
    | { type: "package-unavailable"; package: string; reason: "not-shared" | "too-big" }
    /**
     * To a window joining by a code alone (the start page): the program the panel's playing,
     * as its address names it (`ttx:0nqmm8fa1t2`, or a built-in one's name)
     */
    | { type: "program"; program: string }
    /** A piece of the package, as base64, once accepted. */
    | { type: "package-piece"; package: string; index: number; count: number; data: string };

/**
 * A message from the panel as sent: with an id, so a terminal that gets it twice (from the
 * same browser and over the network) carries it out once.
 */
export type GmEnvelope = GmMessage & {
    id: string;
    /** For one players' window only, by its id (the others leave it); for every one, without */
    to?: string;
};

/** Teletronix's own sounds a GM can play. */
export const BUILTIN_SOUNDS = {
    alert: "Alert",
    beep: "Beep",
    select: "Select",
    glitch: "Glitch",
    static: "Static",
} as const;
export type BuiltinSound = keyof typeof BUILTIN_SOUNDS;

/** From a players' terminal to the panel. */
export type PlayerMessage =
    | {
          type: "state";
          /** Which players' window it is (there can be more than one) */
          player: string;
          state: PlayerState;
      }
    /** A players' window without the GM's package asks about it, then accepts it. */
    | { type: "package-wanted" | "package-accepted"; player: string; package: string }
    /** A window joining by a code alone asks which program the panel's playing. */
    | { type: "program-wanted"; player: string };

/** Whether something received is a message of ours, with a type. */
export const isMessage = (data: unknown): data is { type: string } =>
    typeof data === "object" && data !== null && "type" in data && typeof data.type === "string";
