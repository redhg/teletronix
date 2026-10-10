import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { type Program, Terminal } from "../engine/index.ts";
import { rememberProgram } from "../last-program.ts";
import { acceptPackages, choosePackage } from "../package/open.ts";
import { followRemote } from "../remote/follow.ts";
import { AnimationFrameTicker } from "./animation-frame-ticker.ts";
import { applyAppearance, followPixelRatio, loadFont } from "./appearance.ts";
import { ErrorView } from "./ErrorView.tsx";
import { loadElement } from "./load-element.ts";
import { loadProgram, packageFiles } from "./load-program.ts";
import { Player } from "./Player.tsx";
import { PreviewHost } from "./PreviewHost.tsx";
import { keepSaved } from "./save.ts";
import "../styles/theme.css";
import "../styles/base.css";

const FONT_TIMEOUT = 1000;

/**
 * Loads a program and runs it. `?data=<name>` picks the program; `?preview` plays it in the
 * editor, as it's edited (see PreviewHost); `?kiosk` runs
 * it full screen, for a game table or an exhibit. A GM's panel (`&gm`) can control it.
 */
export async function startPlayer(root: Root, params: URLSearchParams): Promise<void> {
    followPixelRatio();
    // in the editor, a preview of the program as it's edited, which the editor sends
    if (params.has("preview")) {
        // (a package's program, in the editor: its files, from the package)
        const files = await packageFiles(params.get("data"));
        root.render(
            <StrictMode>
                <PreviewHost create={createTerminal} files={files} />
            </StrictMode>,
        );
        return;
    }

    // a package (.ttx) dropped on the page, or chosen with Cmd/Ctrl+O, plays here
    acceptPackages();
    const result = await loadProgram(params.get("data") ?? "sample");
    if (!result.ok) {
        root.render(
            <ErrorView
                title={result.title}
                errors={result.errors}
                // (a package opened elsewhere: choose it here too)
                action={
                    result.missingPackage
                        ? { label: "> CHOOSE THE PACKAGE…", run: () => choosePackage() }
                        : undefined
                }
            />,
        );
        return;
    }

    const { program } = result;
    rememberProgram(location.search);
    document.title = program.config.name;
    applyAppearance(program.palette, program.font, program.fontScale, program.lineSpacing);
    // wait briefly for the font, so the first measurement of the line length is right
    await Promise.race([
        loadFont(program.font).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT)),
    ]);

    // #id in the address starts on that screen (handy while writing one)
    const terminal = createTerminal(program, screenInHash());
    // and changing it jumps there
    window.addEventListener("hashchange", () => {
        const screen = screenInHash();
        if (screen !== undefined && program.screens.has(screen)) terminal.navigate(screen);
    });
    // carry on from saved progress, and keep saving
    keepSaved(terminal);
    // a GM's panel (`&gm`) in another window can control it, and with `&join`, one on
    // another device too
    const remote = followRemote(terminal, params.get("data") ?? "sample", {
        // (`&remote` too, as it was called before sessions)
        join: params.has("join") || params.has("remote"),
        // `&join=BCDF-1234` joins the session that showed it (e.g. in a QR code)
        code: params.get("join") || params.get("remote") || undefined,
        // (a package's files, which the panel names by their "data/…" paths)
        ...(result.files ? { files: result.files } : {}),
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
                preview={false}
                kiosk={params.has("kiosk")}
                remote={remote}
            />
        </StrictMode>,
    );
}

/** A terminal for a program, starting on `startAt` (if it has that screen). */
function createTerminal(program: Program, startAt?: string): Terminal {
    return new Terminal({
        program,
        ticker: new AnimationFrameTicker(),
        load: loadElement,
        instant: matchMedia("(prefers-reduced-motion: reduce)").matches,
        startAt: startAt !== undefined && program.screens.has(startAt) ? startAt : undefined,
    });
}

/** The screen named in the page's address, as #id, if any. */
function screenInHash(): string | undefined {
    const id = decodeURIComponent(location.hash.slice(1));
    return id === "" ? undefined : id;
}
