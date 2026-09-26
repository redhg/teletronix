import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Terminal } from "./engine/index.ts";
import { AnimationFrameTicker } from "./ui/animation-frame-ticker.ts";
import { ErrorView } from "./ui/ErrorView.tsx";
import { loadProgram } from "./ui/load-program.ts";
import { TerminalView } from "./ui/TerminalView.tsx";
import { TerminalContext } from "./ui/terminal-context.ts";
import "./styles/fonts.css";
import "./styles/theme.css";
import "./styles/base.css";

const FONT_TIMEOUT = 1000;

async function main() {
    const root = createRoot(document.getElementById("root") as HTMLElement);
    const name = new URLSearchParams(location.search).get("data") ?? "sample";

    // wait briefly for the font, so the first measurement of the line length is right
    const font = getComputedStyle(document.body).fontFamily;
    const [result] = await Promise.all([
        loadProgram(name),
        Promise.race([
            document.fonts.load(`1em ${font}`),
            new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT)),
        ]),
    ]);

    if (!result.ok) {
        root.render(<ErrorView title={result.title} errors={result.errors} />);
        return;
    }

    document.title = result.program.config.name;
    const terminal = new Terminal({
        program: result.program,
        ticker: new AnimationFrameTicker(),
        instant: matchMedia("(prefers-reduced-motion: reduce)").matches,
    });

    root.render(
        <StrictMode>
            <TerminalContext value={terminal}>
                <TerminalView />
            </TerminalContext>
        </StrictMode>,
    );
}

main();
