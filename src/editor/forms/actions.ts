// An action as the editor's form sees it: one thing it does (go to a screen, open a dialog, go
// back, restart, or nothing more), with a sound to play and variables to set on the way.
// Anything else (cases with conditions, a screen picked at random, timers) is JSON.

/** What an action mainly does. */
export type ActionKind = "screen" | "dialog" | "back" | "restart" | "none";

export const ACTION_KINDS: { value: ActionKind; label: string }[] = [
    { value: "screen", label: "Go to a screen" },
    { value: "dialog", label: "Open a dialog" },
    { value: "back", label: "Go back" },
    { value: "restart", label: "Restart the program" },
    { value: "none", label: "Only set variables or play a sound" },
];

/** The settings the form has fields for. */
const FORM_KEYS = new Set(["screen", "dialog", "frame", "back", "restart", "sound", "set"]);

type ActionObject = Record<string, unknown>;

const isObject = (value: unknown): value is ActionObject =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether the form can show an action whole (undefined is an action not chosen yet). */
export function fitsForm(value: unknown): value is ActionObject | undefined {
    if (value === undefined) return true;
    if (!isObject(value)) return false;
    if (!Object.keys(value).every((key) => FORM_KEYS.has(key))) return false;
    if (value.screen !== undefined && typeof value.screen !== "string") return false;
    if (value.dialog !== undefined && typeof value.dialog !== "string") return false;
    return true;
}

/** What an action mainly does, or null for one not chosen yet. */
export function kindOf(value: ActionObject | undefined): ActionKind | null {
    if (value === undefined) return null;
    if (value.screen !== undefined) return "screen";
    if (value.dialog !== undefined) return "dialog";
    if (value.back !== undefined) return "back";
    if (value.restart !== undefined) return "restart";
    return "none";
}

/**
 * The action made to do something else, keeping its sound, and its variables unless it now
 * restarts (which starts them afresh). A screen or dialog to go to starts as the one it went
 * to before, if any, or else the first there is.
 */
export function withKind(
    value: ActionObject | undefined,
    kind: ActionKind,
    choices: { screens: string[]; dialogs: string[] },
): ActionObject {
    const { screen, dialog, frame: _, back: __, restart: ___, set, ...kept } = value ?? {};
    const keepSet = kind !== "restart" && set !== undefined ? { set } : {};
    switch (kind) {
        case "screen":
            return {
                screen: typeof screen === "string" ? screen : (choices.screens[0] ?? ""),
                ...keepSet,
                ...kept,
            };
        case "dialog":
            return {
                dialog: typeof dialog === "string" ? dialog : (choices.dialogs[0] ?? ""),
                ...keepSet,
                ...kept,
            };
        case "back":
            return { back: true, ...keepSet, ...kept };
        case "restart":
            return { restart: true, ...kept };
        case "none":
            return { ...keepSet, ...kept };
    }
}

/** The action with one setting changed, or left out for undefined. */
export function withSetting(value: ActionObject | undefined, key: string, setting: unknown) {
    const next: ActionObject = { ...value };
    if (setting === undefined || setting === "") delete next[key];
    else next[key] = setting;
    return next;
}
