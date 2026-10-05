import { useEffect, useRef, useState } from "react";
import { type Program, parseProgram, type Terminal } from "../engine/index.ts";
import { Player } from "./Player.tsx";
import { isPreviewMessage, type PreviewMessage } from "./preview-protocol.ts";

interface Props {
    create: (program: Program, startAt?: string) => Terminal;
}

interface Running {
    program: Program;
    terminal: Terminal;
    version: number;
}

/**
 * The player in the editor's preview: it plays the program as it's edited, which the editor
 * sends when the preview says it's ready. Each version replaces the last, starting on the
 * screen the editor asks for, or the one that was showing (if the program still has it). It
 * tells the editor which screen it's on.
 */
export function PreviewHost({ create }: Props) {
    const [running, setRunning] = useState<Running | null>(null);
    const terminal = running?.terminal ?? null;

    // ready for a program
    useEffect(() => {
        const ready: PreviewMessage = { type: "teletronix:ready" };
        window.parent.postMessage(ready, location.origin);
    }, []);

    // a new version of the program from the editor
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (!isPreviewMessage(event) || event.source !== window.parent) return;
            if (event.data.type === "teletronix:dialog") {
                if (terminal?.program.dialogs.has(event.data.dialog)) {
                    terminal.openDialog(event.data.dialog);
                }
                return;
            }
            if (event.data.type === "teletronix:go") {
                const { screen } = event.data;
                if (terminal?.program.screens.has(screen)) terminal.navigate(screen);
                return;
            }
            if (event.data.type !== "teletronix:program") return;
            const result = parseProgram(event.data.file);
            // (a program with mistakes in it keeps the last good version showing)
            if (!result.ok) return;
            const showing = terminal?.getSnapshot().screen?.run.screen.id;
            const next = create(result.program, event.data.screen ?? showing);
            setRunning((was) => ({
                program: result.program,
                terminal: next,
                version: (was?.version ?? 0) + 1,
            }));
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [terminal, create]);

    // the old version stops once the new one's showing (not in a cleanup: React runs those
    // on a terminal still in use, in development)
    const previous = useRef<Terminal | null>(null);
    useEffect(() => {
        if (previous.current && previous.current !== terminal) previous.current.destroy();
        previous.current = terminal;
    }, [terminal]);

    // and the editor hears which screen it's on
    useEffect(() => {
        if (!terminal) return;
        let last: string | null | undefined;
        const report = () => {
            const screen = terminal.getSnapshot().screen?.run.screen.id ?? null;
            if (screen === last) return;
            last = screen;
            const message: PreviewMessage = { type: "teletronix:screen", screen };
            window.parent.postMessage(message, location.origin);
        };
        report();
        return terminal.subscribe(report);
    }, [terminal]);

    if (!running) return null;
    const { program, version } = running;
    return (
        <Player
            key={version}
            terminal={running.terminal}
            initial={{
                theme: program.theme,
                font: program.font,
                fontScale: program.fontScale,
                lineSpacing: program.lineSpacing,
            }}
            preview
        />
    );
}
