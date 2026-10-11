import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { DEFAULT_FONT, resolveTheme } from "../engine/index.ts";
import { acceptPackages } from "../package/open.ts";
import { applyAppearance, loadFont } from "./appearance.ts";
import { StartPage } from "./StartPage.tsx";
import "../styles/theme.css";
import "../styles/base.css";

/** The start page (an address without a program), in Teletronix's own look. */
export function startPage(root: Root): void {
    document.title = "Teletronix";
    applyAppearance(resolveTheme(undefined), DEFAULT_FONT);
    void loadFont(DEFAULT_FONT).catch(() => {});
    // (a package dropped on it, or chosen with Cmd/Ctrl+O, plays)
    acceptPackages();
    root.render(
        <StrictMode>
            <StartPage />
        </StrictMode>,
    );
}
