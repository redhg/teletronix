import { type FormEvent, type HTMLAttributes, useEffect, useId, useRef, useState } from "react";
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
    inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
    /**
     * What's typed after the up or down arrow key: `steps` is 1 or -1 (10 or -10 with Shift).
     * Without it, the arrow keys do nothing.
     */
    step?: (typed: string, steps: number) => string;
    /**
     * Runs what was entered (never blank). Returns what to show underneath, when it wasn't
     * understood, or null when it was.
     */
    onSubmit: (entered: string) => string | null;
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
    inputMode,
    step,
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

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        setValue("");
        if (!value.trim()) {
            setMessage(null);
            return;
        }
        const problem = onSubmit(value);
        setMessage(problem);
        sound({ type: problem === null ? "select" : "error" });
    };

    return (
        <form
            className={classNames("prompt", disabled && "disabled", className)}
            onSubmit={handleSubmit}
        >
            <div className="prompt-line">
                <label htmlFor={inputId}>
                    <RevealText run={run} index={index} />
                </label>
                {interactive && (
                    <span className="prompt-field">
                        <input
                            ref={input}
                            id={inputId}
                            value={value}
                            disabled={disabled}
                            inputMode={inputMode}
                            onKeyDown={(event) => {
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
