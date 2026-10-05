import type { EffectsSetting, FontId, SoundSetting, ThemeSetting } from "../engine/index.ts";

/**
 * Messages between the editor and the player it previews in an iframe. Both are the same
 * app on the same origin; messages from anywhere else are ignored.
 */
export interface AppearanceSettings {
    theme: ThemeSetting | undefined;
    font: FontId;
    fontScale: number;
    lineSpacing: number;
    effects: EffectsSetting | undefined;
    sound: SoundSetting | undefined;
}

export type PreviewMessage =
    /** From the preview: it's ready for settings. */
    | { type: "teletronix:ready" }
    /** From the editor: show the program with these settings. */
    | { type: "teletronix:appearance"; settings: AppearanceSettings }
    /**
     * From the editor: play this program (as written) instead, starting on `screen` (default:
     * the screen it's showing, if the program still has it).
     */
    | { type: "teletronix:program"; file: unknown; screen?: string }
    /** From the editor: open this dialog (the one being edited). */
    | { type: "teletronix:dialog"; dialog: string }
    /** From the editor: show this screen (the one being edited). */
    | { type: "teletronix:go"; screen: string }
    /** From the preview: the screen it's showing, as it changes. */
    | { type: "teletronix:screen"; screen: string | null };

export function isPreviewMessage(event: MessageEvent): event is MessageEvent<PreviewMessage> {
    const data: unknown = event.data;
    return (
        event.origin === location.origin &&
        typeof data === "object" &&
        data !== null &&
        "type" in data &&
        typeof data.type === "string" &&
        data.type.startsWith("teletronix:")
    );
}
