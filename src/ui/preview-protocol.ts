import type { EffectsSetting, FontId, SoundSetting, ThemeSetting } from "../engine/index.ts";

/**
 * Messages between the settings page and the player it previews in an iframe. Both are
 * the same app on the same origin; messages from anywhere else are ignored.
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
    /** From the settings page: show the program with these settings. */
    | { type: "teletronix:appearance"; settings: AppearanceSettings };

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
