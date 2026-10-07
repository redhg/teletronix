import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
    type FontId,
    resolveSound,
    resolveTheme,
    type Terminal,
    type ThemeSetting,
    themeEffects,
    themeFont,
} from "../engine/index.ts";
import type { Remote } from "../remote/follow.ts";
import { RemoteBadge } from "../remote/RemoteBadge.tsx";
import { applyAppearance, loadFont } from "./appearance.ts";
import { mapCharacters } from "./character-map.ts";
import { KioskGate, useKiosk } from "./kiosk/Kiosk.tsx";
import { PaletteContext } from "./palette-context.ts";
import { isPreviewMessage } from "./preview-protocol.ts";
import { SettingsContext } from "./settings/context.ts";
import { SettingsDialog } from "./settings/SettingsDialog.tsx";
import {
    devicePreferences,
    loadSettings,
    type PlayerSettings,
    resolveSettings,
    saveSettings,
} from "./settings/settings.ts";
import { SoundLayer } from "./sound/SoundLayer.tsx";
import { TerminalView } from "./TerminalView.tsx";
import { TerminalContext } from "./terminal-context.ts";

interface Props {
    terminal: Terminal;
    initial: {
        theme: ThemeSetting | undefined;
        font: FontId;
        fontScale: number;
        lineSpacing: number;
    };
    /** Take appearance settings from the parent page (the settings panel). */
    preview: boolean;
    /** Run as a kiosk: full screen, awake, and hard to leave (see useKiosk). */
    kiosk?: boolean;
    /** A GM's remote control, whose pairing code it shows */
    remote?: Remote;
}

/** Runs a program, applying its colors and font. */
export function Player({ terminal, initial, preview, kiosk = false, remote }: Props) {
    const [theme, setTheme] = useState(initial.theme);
    const [font, setFont] = useState(initial.font);
    const [fontScale, setFontScale] = useState(initial.fontScale);
    const [lineSpacing, setLineSpacing] = useState(initial.lineSpacing);
    const [sound, setSound] = useState(terminal.program.sound);
    // changes once the font has loaded, so the line length is measured again
    const [loadedFont, setLoadedFont] = useState<FontId | null>(null);

    // a kiosk waits for a key press or tap before starting, to go full screen
    const [started, setStarted] = useState(!kiosk);
    const start = useCallback(() => setStarted(true), []);
    useKiosk(terminal, kiosk && started);

    // the player's own settings, over the program's: on their device, unless it's the editor's
    // preview or the program says no
    const name = terminal.program.config.name;
    const allowed = !preview && terminal.program.playerSettings;
    const [own, setOwn] = useState<PlayerSettings>(() => (allowed ? loadSettings(name) : {}));
    const [device] = useState(devicePreferences);
    const settings = useMemo(
        () => (allowed ? resolveSettings(own, device) : null),
        [allowed, own, device],
    );
    const changeSettings = useCallback(
        (change: Partial<PlayerSettings>) =>
            setOwn((was) => {
                const next = { ...was, ...change };
                saveSettings(name, next);
                return next;
            }),
        [name],
    );
    const [settingsOpen, setSettingsOpen] = useState(false);
    const openSettings = useCallback(() => setSettingsOpen(true), []);

    const look = settings && settings.look !== "program" ? settings.look : null;
    const shownFont = look ? (themeFont(look) ?? font) : font;
    const shownScale = fontScale * (settings?.textSize ?? 1);
    const palette = useMemo(() => resolveTheme(look ?? theme), [look, theme]);
    useLayoutEffect(
        () => applyAppearance(palette, shownFont, shownScale, lineSpacing),
        [palette, shownFont, shownScale, lineSpacing],
    );
    useEffect(() => {
        if (!settings) return;
        terminal.setEffectsOff(look !== null || !settings.effects);
        terminal.setInstant(settings.instant);
    }, [terminal, settings, look]);
    const shownSound = useMemo(
        () =>
            sound && settings?.volume !== undefined ? { ...sound, volume: settings.volume } : sound,
        [sound, settings?.volume],
    );

    // Ctrl+, opens (and closes) the quick settings, from anywhere
    useEffect(() => {
        if (!allowed) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "," || !event.ctrlKey || event.metaKey || event.altKey) return;
            event.preventDefault();
            setSettingsOpen((was) => !was);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [allowed]);

    useEffect(() => {
        let current = true;
        loadFont(shownFont).then(
            () => current && setLoadedFont(shownFont),
            () => current && setLoadedFont(shownFont),
        );
        return () => {
            current = false;
        };
    }, [shownFont]);

    // characters the program shows as others, wherever they're drawn
    useEffect(() => mapCharacters(document.body, terminal.program.characters ?? {}), [terminal]);

    // block the browser's right-click menu, except in text fields (for pasting)
    const blockContextMenu = terminal.program.blockContextMenu;
    useEffect(() => {
        if (!blockContextMenu) return;
        const handleContextMenu = (event: MouseEvent) => {
            if (event.target instanceof Element && event.target.closest("input, textarea")) return;
            event.preventDefault();
        };
        document.addEventListener("contextmenu", handleContextMenu);
        return () => document.removeEventListener("contextmenu", handleContextMenu);
    }, [blockContextMenu]);

    useEffect(() => {
        if (!preview || window.parent === window) return;
        const handleMessage = (event: MessageEvent) => {
            if (!isPreviewMessage(event) || event.source !== window.parent) return;
            if (event.data.type !== "teletronix:appearance") return;
            const { settings } = event.data;
            setTheme(settings.theme);
            setFont(settings.font);
            setFontScale(settings.fontScale);
            setLineSpacing(settings.lineSpacing);
            terminal.setEffects(settings.effects, themeEffects(settings.theme));
            setSound(resolveSound(settings.sound));
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [preview, terminal]);

    return (
        <TerminalContext value={terminal}>
            <PaletteContext value={palette}>
                <SettingsContext value={allowed ? openSettings : null}>
                    <SoundLayer terminal={terminal} sound={shownSound}>
                        {started ? (
                            <>
                                <TerminalView
                                    layoutKey={`${shownFont}:${loadedFont}:${shownScale}:${lineSpacing}`}
                                />
                                {remote && <RemoteBadge remote={remote} />}
                            </>
                        ) : (
                            <KioskGate title={terminal.program.config.name} onStart={start} />
                        )}
                        {settings && settingsOpen && (
                            <SettingsDialog
                                settings={settings}
                                programVolume={sound?.volume ?? null}
                                change={changeSettings}
                                reset={() => {
                                    saveSettings(name, {});
                                    setOwn({});
                                }}
                                close={() => setSettingsOpen(false)}
                            />
                        )}
                    </SoundLayer>
                </SettingsContext>
            </PaletteContext>
        </TerminalContext>
    );
}
