import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal, useTerminalSnapshot } from "../../ui/terminal-context.ts";
import { matchCommand, type PromptElement } from "./definition.ts";
import "./style.css";

export function PromptView({ element, state, run, index }: ElementViewProps<PromptElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    const disabled = useTerminalSnapshot().dialog !== null;
    const input = useRef<HTMLInputElement>(null);
    const inputId = useId();
    const [value, setValue] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const done = state === "done";

    // take the keyboard once revealed, and back after a dialog closes
    useEffect(() => {
        if (done && !disabled) input.current?.focus({ preventScroll: true });
    }, [done, disabled]);

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const action = matchCommand(element, value);
        setValue("");
        setMessage(action || !value.trim() ? null : element.unknown);
        if (action) {
            sound({ type: "select" });
            terminal.dispatch(action);
        } else if (value.trim()) {
            sound({ type: "error" });
        }
    };

    return (
        <form
            className={classNames("prompt", disabled && "disabled", element.className)}
            onSubmit={handleSubmit}
        >
            <div className="prompt-line">
                <label htmlFor={inputId}>
                    <RevealText run={run} index={index} />
                </label>
                {done && (
                    <span className="prompt-field">
                        <input
                            ref={input}
                            id={inputId}
                            value={value}
                            disabled={disabled}
                            onChange={(event) => {
                                setValue(event.target.value);
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
                            {value}
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
