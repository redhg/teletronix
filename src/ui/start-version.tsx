import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { DEFAULT_FONT, resolveTheme } from "../engine/index.ts";
import { applyAppearance, loadFont } from "./appearance.ts";
import { VersionView } from "./VersionView.tsx";
import "../styles/theme.css";
import "../styles/base.css";

/** `?version`, in Teletronix's own look. */
export function startVersion(root: Root): void {
    document.title = "Teletronix version";
    applyAppearance(resolveTheme(undefined), DEFAULT_FONT);
    void loadFont(DEFAULT_FONT).catch(() => {});
    root.render(
        <StrictMode>
            <VersionView />
        </StrictMode>,
    );
}
