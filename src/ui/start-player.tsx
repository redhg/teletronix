import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { Terminal } from "../engine/index.ts";
import { AnimationFrameTicker } from "./animation-frame-ticker.ts";
import { applyAppearance, loadFont } from "./appearance.ts";
import { ErrorView } from "./ErrorView.tsx";
import { loadElement } from "./load-element.ts";
import { loadProgram } from "./load-program.ts";
import { Player } from "./Player.tsx";
import "../styles/theme.css";
import "../styles/base.css";

const FONT_TIMEOUT = 1000;

/**
 * Loads a program and runs it. `?data=<name>` picks the program; `?preview` takes
 * appearance settings from the page it's embedded in (the settings panel).
 */
export async function startPlayer(root: Root, params: URLSearchParams): Promise<void> {
    const result = await loadProgram(params.get("data") ?? "sample");
    if (!result.ok) {
        root.render(<ErrorView title={result.title} errors={result.errors} />);
        return;
    }

    const { program } = result;
    document.title = program.config.name;
    applyAppearance(program.palette, program.font);
    // wait briefly for the font, so the first measurement of the line length is right
    await Promise.race([
        loadFont(program.font).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT)),
    ]);

    const terminal = new Terminal({
        program,
        ticker: new AnimationFrameTicker(),
        load: loadElement,
        instant: matchMedia("(prefers-reduced-motion: reduce)").matches,
    });

    root.render(
        <StrictMode>
            <Player
                terminal={terminal}
                initial={{ theme: program.theme, font: program.font }}
                preview={params.has("preview")}
            />
        </StrictMode>,
    );
}
