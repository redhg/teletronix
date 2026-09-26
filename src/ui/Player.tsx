import { useEffect, useLayoutEffect, useState } from "react";
import { type FontId, resolveTheme, type Terminal, type ThemeSetting } from "../engine/index.ts";
import { applyAppearance, loadFont } from "./appearance.ts";
import { isPreviewMessage, type PreviewMessage } from "./preview-protocol.ts";
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
    // changes once the font has loaded, so the line length is measured again
    const [loadedFont, setLoadedFont] = useState<FontId | null>(null);

    useLayoutEffect(() => applyAppearance(resolveTheme(theme), font), [theme, font]);

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

    useEffect(() => {
        if (!preview || window.parent === window) return;
        const handleMessage = (event: MessageEvent) => {
            if (!isPreviewMessage(event) || event.source !== window.parent) return;
            if (event.data.type !== "teletronix:appearance") return;
            const { settings } = event.data;
            setTheme(settings.theme);
            setFont(settings.font);
            terminal.setEffects(settings.effects);
        };
        window.addEventListener("message", handleMessage);
        const ready: PreviewMessage = { type: "teletronix:ready" };
        window.parent.postMessage(ready, location.origin);
        return () => window.removeEventListener("message", handleMessage);
    }, [preview, terminal]);

    return (
        <TerminalContext value={terminal}>
            <TerminalView layoutKey={`${font}:${loadedFont}`} />
        </TerminalContext>
    );
}
