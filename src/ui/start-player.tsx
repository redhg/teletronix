import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { Terminal } from "../engine/index.ts";
import { rememberProgram } from "../last-program.ts";
import { followRemote } from "../remote/follow.ts";
import { CODE_LENGTH, cleanCode } from "../remote/link.ts";
import { AnimationFrameTicker } from "./animation-frame-ticker.ts";
import { applyAppearance, followPixelRatio, loadFont } from "./appearance.ts";
import { ErrorView } from "./ErrorView.tsx";
import { loadElement } from "./load-element.ts";
import { loadProgram } from "./load-program.ts";
import { Player } from "./Player.tsx";
import { keepSaved } from "./save.ts";
import "../styles/theme.css";
import "../styles/base.css";

const FONT_TIMEOUT = 1000;

/**
 * Loads a program and runs it. `?data=<name>` picks the program; `?preview` takes
 * appearance settings from the page it's embedded in (the settings panel); `?kiosk` runs
 * it full screen, for a game table or an exhibit. A GM's panel (`&gm`) can control it.
 */
export async function startPlayer(root: Root, params: URLSearchParams): Promise<void> {
    const result = await loadProgram(params.get("data") ?? "sample");
    if (!result.ok) {
        root.render(<ErrorView title={result.title} errors={result.errors} />);
        return;
    }

    const { program } = result;
    if (!params.has("preview")) rememberProgram(location.search);
    document.title = program.config.name;
    applyAppearance(program.palette, program.font, program.fontScale, program.lineSpacing);
    followPixelRatio();
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
        // #id in the address starts on that screen (handy while writing one)
        startAt: screenInHash(),
    });
    // and changing it jumps there
    window.addEventListener("hashchange", () => {
        const screen = screenInHash();
        if (screen !== undefined && program.screens.has(screen)) terminal.navigate(screen);
    });
    // carry on from saved progress, and keep saving (not while previewing settings)
    if (!params.has("preview")) keepSaved(terminal);
    // a GM's panel (`&gm`) in another window can control it, and with `&remote`, one on
    // another device too (not while previewing settings)
    const remote = params.has("preview")
        ? undefined
        : followRemote(terminal, params.get("data") ?? "sample", {
              network: params.has("remote"),
              // `&remote=K7QX` pairs with the panel that showed it (e.g. in a QR code)
              code: givenCode(params.get("remote")),
          });

    root.render(
        <StrictMode>
            <Player
                terminal={terminal}
                initial={{
                    theme: program.theme,
                    font: program.font,
                    fontScale: program.fontScale,
                    lineSpacing: program.lineSpacing,
                }}
                preview={params.has("preview")}
                kiosk={params.has("kiosk") && !params.has("preview")}
                remote={remote}
            />
        </StrictMode>,
    );
}

/** A pairing code given in the address, if it's one. */
function givenCode(value: string | null): string | undefined {
    const code = cleanCode(value ?? "");
    return code.length >= CODE_LENGTH ? code : undefined;
}

/** The screen named in the page's address, as #id, if any. */
function screenInHash(): string | undefined {
    const id = decodeURIComponent(location.hash.slice(1));
    return id === "" ? undefined : id;
}
