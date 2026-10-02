import type { EffectsSetting, VariableValue } from "../engine/index.ts";

// Messages between a GM's control panel (`&gm`) and the players' terminal, in two windows of
// the same browser. They go through a BroadcastChannel named after the program, so a panel
// controls every players' window of its program, and nothing else can reach them.

/** The channel for a program, by its name in the address (`?data=<name>`). */
export const channelName = (program: string) => `teletronix:remote:${program}`;

/** What the players' terminal is showing, as the panel sees it. */
export interface PlayerState {
    screen: string | null;
    /** The open dialog's id ("@transmission" for one the GM sent) */
    dialog: string | null;
    variables: Record<string, VariableValue>;
    timers: Record<string, { seconds: number | undefined; running: boolean }>;
}

/** From the panel to the players' terminal. */
export type GmMessage =
    /** Asks every players' window to send its state. */
    | { type: "hello" }
    /** An action, as written in a program: go to a screen, open a dialog, set variables… */
    | { type: "action"; action: unknown }
    /** Effects laid over the program's, or null for none. */
    | { type: "effects"; effects: EffectsSetting | null }
    /** A burst of heavy static, for `ms` milliseconds. */
    | { type: "burst"; ms: number }
    /** A message, typed into a dialog. */
    | { type: "transmit"; text: string; dismiss?: string; alert?: boolean }
    /** Closes the open dialog, as if answered "no". */
    | { type: "close-dialog" };

/** From a players' terminal to the panel. */
export interface PlayerMessage {
    type: "state";
    /** Which players' window it is (there can be more than one) */
    player: string;
    state: PlayerState;
}

/** Whether something received is a message of ours, with a type. */
export const isMessage = (data: unknown): data is { type: string } =>
    typeof data === "object" && data !== null && "type" in data && typeof data.type === "string";
