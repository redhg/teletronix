import {
    type FormEvent,
    type HTMLAttributes,
    type ReactNode,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import type { ScreenRun } from "../engine/index.ts";
import { classNames } from "./element-view.ts";
import { RevealText } from "./RevealText.tsx";
import { useSound } from "./sound/context.ts";
import { useTerminalSnapshot } from "./terminal-context.ts";
import "./command-line.css";

interface Props {
    run: ScreenRun;
    index: number;
    /** Whether it can be typed in yet (see ElementViewProps.interactive). */
    interactive: boolean;
    className?: string;
    /** What's typed, kept to what's allowed (e.g. digits only). */
    filter?: (typed: string) => string;
    /** Draw each character typed as * (for codes). */
    mask?: boolean;
    /** Its label, in place of the element's revealed text (e.g. a login's second prompt). */
    label?: ReactNode;
    inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
    /**
     * What's typed after the up or down arrow key: `steps` is 1 or -1 (10 or -10 with Shift).
     * Without it, the arrow keys do nothing.
     */
    step?: (typed: string, steps: number) => string;
    /** Earlier entries, oldest first, for the up and down arrow keys to bring back. */
    history?: readonly string[];
    /** What's typed, completed, for the Tab key (e.g. a file name). */
    complete?: (typed: string) => string;
    /** Take a blank line too (e.g. a shell, which prints a fresh prompt). */
    submitBlank?: boolean;
    /**
     * Runs what was entered (never blank). Returns what to show underneath, when it wasn't
     * understood, or null when it was.
     */
    onSubmit: (entered: string) => string | null | false;
}

/**
 * A line to type on, terminal-style: the element's text, then what's typed and a blinking
 * caret. The shared half of prompts and number inputs.
 */
export function CommandLine({
    run,
    index,
    interactive,
    className,
    filter = (typed) => typed,
    mask = false,
    label,
    inputMode,
    step,
    history,
    complete,
    submitBlank = false,
    onSubmit,
}: Props) {
    const sound = useSound();
    const disabled = useTerminalSnapshot().dialog !== null;
    const input = useRef<HTMLInputElement>(null);
    const inputId = useId();
    const [value, setValue] = useState("");
    const [message, setMessage] = useState<string | null>(null);

    // take the keyboard once it can be used, and back after a dialog closes, unless another
    // field on the screen already has it
    useEffect(() => {
        if (!interactive || disabled) return;
        const active = document.activeElement;
        if (active instanceof HTMLInputElement && active !== input.current) return;
        input.current?.focus({ preventScroll: true });
    }, [interactive, disabled]);

    // where the arrow keys are in the history: its length when not in it
    const [recalled, setRecalled] = useState<number | null>(null);

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        setValue("");
        setRecalled(null);
        if (!value.trim() && !submitBlank) {
            setMessage(null);
            return;
        }
        // a problem to show under the line, or false for one shown some other way
        const problem = onSubmit(value);
        setMessage(problem || null);
        sound({ type: problem === null ? "select" : "error" });
    };

    return (
        <form
            className={classNames("prompt", disabled && "disabled", className)}
            onSubmit={handleSubmit}
        >
            <div className="prompt-line">
                <label htmlFor={inputId}>{label ?? <RevealText run={run} index={index} />}</label>
                {interactive && (
                    <span className="prompt-field">
                        <input
                            ref={input}
                            id={inputId}
                            value={value}
                            disabled={disabled}
                            inputMode={inputMode}
                            onKeyDown={(event) => {
                                if (complete && event.key === "Tab" && value.trim()) {
                                    event.preventDefault();
                                    const next = complete(value);
                                    if (next !== value) setValue(next);
                                    return;
                                }
                                if (
                                    history &&
                                    !step &&
                                    (event.key === "ArrowUp" || event.key === "ArrowDown")
                                ) {
                                    event.preventDefault();
                                    const at = recalled ?? history.length;
                                    const to = Math.min(
                                        history.length,
                                        Math.max(0, at + (event.key === "ArrowUp" ? -1 : 1)),
                                    );
                                    setRecalled(to);
                                    setValue(history[to] ?? "");
                                    return;
                                }
                                const direction =
                                    event.key === "ArrowUp"
                                        ? 1
                                        : event.key === "ArrowDown"
                                          ? -1
                                          : 0;
                                if (!step || direction === 0) return;
                                event.preventDefault();
                                const next = step(value, direction * (event.shiftKey ? 10 : 1));
                                if (next === value) return;
                                setValue(next);
                                sound({ type: "tick" });
                                setMessage(null);
                            }}
                            onChange={(event) => {
                                const next = filter(event.target.value);
                                if (next === value) return;
                                setValue(next);
                                sound({ type: "keypress" });
                                setMessage(null);
                            }}
                            autoComplete="off"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            enterKeyHint="go"
                        />
                        {/* the input is invisible; this draws what's typed, terminal-style */}
                        <span className="prompt-echo" aria-hidden="true">
                            {mask ? "*".repeat(value.length) : value}
                            <span className="prompt-caret"> </span>
                        </span>
                    </span>
                )}
            </div>
            {message && (
                <div className="prompt-message" role="status">
                    {message}
                </div>
            )}
        </form>
    );
}
