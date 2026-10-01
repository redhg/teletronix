import { useContext, useLayoutEffect, useState } from "react";
import { AutoscrollContext } from "../../ui/autoscroll.ts";
import { CommandLine } from "../../ui/CommandLine.tsx";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import type { ShellElement } from "./definition.ts";
import { complete, promptFor, runCommand } from "./machine.ts";
import "./style.css";

/** What a shell remembers from visit to visit: where it is, and what was typed. */
export interface ShellMemory {
    cwd: string[];
    history: string[];
}

interface Entry {
    prompt: string;
    input: string;
    output: string[];
    error: boolean;
}

/** The most commands the arrow keys can bring back. */
const HISTORY = 50;

/**
 * A transcript of what was typed and printed, then the command line, like a real terminal.
 * The folder it's in and what was typed are remembered; the transcript starts afresh.
 */
export function ShellView({ element, interactive, run, index }: ElementViewProps<ShellElement>) {
    const terminal = useTerminal();
    const autoscroll = useContext(AutoscrollContext);
    const [memory, setMemory] = useState<ShellMemory>(
        () => terminal.recall<ShellMemory>(element.id) ?? { cwd: [], history: [] },
    );
    const [transcript, setTranscript] = useState<Entry[]>([]);
    useLayoutEffect(() => {
        if (transcript.length > 0) autoscroll?.follow();
    }, [transcript, autoscroll]);

    const prompt = promptFor(element, memory.cwd);
    return (
        <div className={classNames("shell", element.className)}>
            {transcript.map((entry, k) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a transcript only grows (or clears)
                <div key={k}>
                    <div className="shell-line">
                        {entry.prompt}
                        {entry.input}
                    </div>
                    {entry.output.map((line, i) => (
                        <div
                            // biome-ignore lint/suspicious/noArrayIndexKey: printed once, in order
                            key={i}
                            className={classNames("shell-line", entry.error && "shell-error")}
                        >
                            {line || " "}
                        </div>
                    ))}
                </div>
            ))}
            <CommandLine
                run={run}
                index={index}
                interactive={interactive}
                label={prompt}
                history={memory.history}
                complete={(typed) => complete(element, typed, memory.cwd, terminal.holds)}
                submitBlank
                onSubmit={(entered) => {
                    const result = runCommand(element, entered, memory.cwd, terminal.holds);
                    const entry: Entry = {
                        prompt,
                        input: entered,
                        output: result.output.map((line) => terminal.format(line)),
                        error: result.error ?? false,
                    };
                    setTranscript((before) => (result.clear ? [] : [...before, entry]));
                    const typed = entered.trim();
                    const history =
                        typed && memory.history.at(-1) !== typed
                            ? [...memory.history, typed].slice(-HISTORY)
                            : memory.history;
                    const next = { cwd: result.cwd, history };
                    setMemory(next);
                    terminal.remember(element.id, next);
                    if (result.action) terminal.dispatch(result.action);
                    return result.error ? false : null;
                }}
            />
        </div>
    );
}
