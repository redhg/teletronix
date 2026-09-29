import { useEffect, useId, useState } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import { type ChoiceElement, type ChoiceMemory, chosen, optionLabel, pick } from "./definition.ts";
import "./style.css";

/**
 * A row of options. Each is a real radio button (or checkbox, with multiple), hidden, under
 * its drawn text, so clicks, keys and screen readers all work as they do for those.
 */
export function ChoiceView({ element, interactive, run, index }: ElementViewProps<ChoiceElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    const name = useId();
    // the row as laid out on screen (wrapped and aligned), redrawn when it changes
    const [drawn, setDrawn] = useState("");
    useEffect(
        () =>
            run.subscribeFrame(index, (frame) =>
                setDrawn(frame.map((segment) => segment.text).join("")),
            ),
        [run, index],
    );
    const className = classNames("choice", element.className);

    if (!interactive) {
        return (
            <div className={className}>
                <RevealText run={run} index={index} />
            </div>
        );
    }

    const memory = terminal.recall<ChoiceMemory>(element.id);
    const on = chosen(element, memory);
    const choose = (option: number) => {
        if (!element.multiple && on.includes(option)) return;
        sound({ type: "tick" });
        terminal.remember(element.id, pick(element, memory, option));
    };

    // each option's text, found in the laid-out row, becomes its radio button
    const pieces: (string | number)[] = [];
    let at = 0;
    element.options.forEach((_, option) => {
        const label = optionLabel(element, option, on.includes(option));
        const start = drawn.indexOf(label, at);
        if (start === -1) return;
        if (start > at) pieces.push(drawn.slice(at, start));
        pieces.push(option);
        at = start + label.length;
    });
    if (at < drawn.length) pieces.push(drawn.slice(at));

    return (
        <fieldset className={className}>
            <legend className="sr-only">
                {element.label.trim() || (element.multiple ? "Choose any" : "Choose one")}
            </legend>
            {pieces.map((piece, k) =>
                typeof piece === "string" ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: laid out afresh each time
                    <span key={k} aria-hidden="true">
                        {piece}
                    </span>
                ) : (
                    <label key={element.options[piece]} className="choice-option">
                        <input
                            type={element.multiple ? "checkbox" : "radio"}
                            className="sr-only"
                            name={name}
                            checked={on.includes(piece)}
                            onChange={() => choose(piece)}
                        />
                        <span aria-hidden="true">
                            {optionLabel(element, piece, on.includes(piece))}
                        </span>
                        <span className="sr-only">{element.options[piece]}</span>
                    </label>
                ),
            )}
        </fieldset>
    );
}
