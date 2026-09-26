import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
    type FontId,
    resolveSound,
    resolveTheme,
    type Terminal,
    type ThemeSetting,
} from "../engine/index.ts";
import { applyAppearance, loadFont } from "./appearance.ts";
import { PaletteContext } from "./palette-context.ts";
import { isPreviewMessage, type PreviewMessage } from "./preview-protocol.ts";
import { SoundLayer } from "./sound/SoundLayer.tsx";
import { TerminalView } from "./TerminalView.tsx";
import { TerminalContext } from "./terminal-context.ts";

interface Props {
    terminal: Terminal;
    initial: { theme: ThemeSetting | undefined; font: FontId };
    /** Take appearance settings from the parent page (the settings panel). */
    preview: boolean;
}

/** Runs a program, applying its colors and font. */
export function Player({ terminal, initial, preview }: Props) {
    const [theme, setTheme] = useState(initial.theme);
    const [font, setFont] = useState(initial.font);
    const [sound, setSound] = useState(terminal.program.sound);
    // changes once the font has loaded, so the line length is measured again
    const [loadedFont, setLoadedFont] = useState<FontId | null>(null);

    const palette = useMemo(() => resolveTheme(theme), [theme]);
    useLayoutEffect(() => applyAppearance(palette, font), [palette, font]);

    useEffect(() => {
        let current = true;
        loadFont(font).then(
            () => current && setLoadedFont(font),
            () => current && setLoadedFont(font),
        );
        return () => {
            current = false;
        };
    }, [font]);

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
            terminal.setEffects(settings.effects);
            setSound(resolveSound(settings.sound));
        };
        window.addEventListener("message", handleMessage);
        const ready: PreviewMessage = { type: "teletronix:ready" };
        window.parent.postMessage(ready, location.origin);
        return () => window.removeEventListener("message", handleMessage);
    }, [preview, terminal]);

    return (
        <TerminalContext value={terminal}>
            <PaletteContext value={palette}>
                <SoundLayer terminal={terminal} sound={sound}>
                    <TerminalView layoutKey={`${font}:${loadedFont}`} />
                </SoundLayer>
            </PaletteContext>
        </TerminalContext>
    );
}
