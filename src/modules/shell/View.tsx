import { useContext, useLayoutEffect, useState } from "react";
import { AutoscrollContext } from "../../ui/autoscroll.ts";
import { CommandLine } from "../../ui/CommandLine.tsx";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { StyledText } from "../../ui/StyledText.tsx";
import { useTerminal } from "../../ui/terminal-context.ts";
import type { ShellElement } from "./definition.ts";
import { complete, promptFor, runCommand } from "./machine.ts";
import "./style.css";

/** What a shell remembers from visit to visit: where it is, and what was typed. */
export interface ShellMemory {
    cwd: string[];
    history: string[];
    /** Paths whose passwords have been given (see pathKey). */
    unlocked?: string[];
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
    // a command waiting for a password, and what it needs
    const [asking, setAsking] = useState<{
        input: string;
        lock: { key: string; password: string };
    } | null>(null);

    /**
     * Runs what was typed, from `from` (the memory as it stands), printing it (`echo`: with
     * its prompt) and what it says, unless it needs a password first.
     */
    const execute = (entered: string, from: ShellMemory, echo: boolean): string | null | false => {
        const result = runCommand(element, entered, from.cwd, terminal.holds, from.unlocked ?? []);
        const output = result.output.map((line) => terminal.format(line));
        const entry: Entry = { prompt, input: entered, output, error: result.error ?? false };
        if (result.clear) setTranscript([]);
        else if (echo) setTranscript((before) => [...before, entry]);
        else if (output.length > 0) {
            // (after a password: what it says goes under the password's line)
            setTranscript((before) => {
                const last = before.at(-1);
                if (!last) return [...before, entry];
                const joined = { ...last, output: [...last.output, ...output], error: entry.error };
                return [...before.slice(0, -1), joined];
            });
        }
        const typed = entered.trim();
        const history =
            echo && typed && from.history.at(-1) !== typed
                ? [...from.history, typed].slice(-HISTORY)
                : from.history;
        const next: ShellMemory = { cwd: result.cwd, history, unlocked: from.unlocked ?? [] };
        setMemory(next);
        terminal.remember(element.id, next);
        if (result.ask) {
            setAsking({ input: entered, lock: result.ask });
            return null;
        }
        if (result.action) terminal.dispatch(result.action);
        return result.error ? false : null;
    };
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
                            {line ? <StyledText text={line} /> : " "}
                        </div>
                    ))}
                </div>
            ))}
            {asking ? (
                <CommandLine
                    // (a fresh line for each password)
                    key={`password-${transcript.length}`}
                    run={run}
                    index={index}
                    interactive={interactive}
                    label={element.passwordPrompt}
                    mask
                    submitBlank
                    onSubmit={(password) => {
                        const { input, lock } = asking;
                        setAsking(null);
                        if (password !== lock.password) {
                            setTranscript((before) => [
                                ...before,
                                {
                                    prompt: element.passwordPrompt,
                                    input: "",
                                    output: [element.denied],
                                    error: true,
                                },
                            ]);
                            return false;
                        }
                        const unlocked = [...(memory.unlocked ?? []), lock.key];
                        setTranscript((before) => [
                            ...before,
                            { prompt: element.passwordPrompt, input: "", output: [], error: false },
                        ]);
                        execute(input, { ...memory, unlocked }, false);
                        return null;
                    }}
                />
            ) : (
                <CommandLine
                    run={run}
                    index={index}
                    interactive={interactive}
                    label={prompt}
                    history={memory.history}
                    complete={(typed) => complete(element, typed, memory.cwd, terminal.holds)}
                    submitBlank
                    onSubmit={(entered) => execute(entered, memory, true)}
                />
            )}
        </div>
    );
}
