import { useLayoutEffect, useState } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import { bigDigits, bigWidth } from "./big-digits.ts";
import type { TimerElement } from "./definition.ts";
import "./style.css";

/**
 * A timer's label and time. The engine redraws it as the seconds tick. With "big", once it
 * has appeared, the time is drawn in big block digits under the label (if they fit).
 */
export function TimerView({ element, state, run, index }: ElementViewProps<TimerElement>) {
    const [text, setText] = useState("");
    useLayoutEffect(() => {
        if (!element.big) return;
        return run.subscribeFrame(index, (_frame, current) => setText(current));
    }, [element.big, run, index]);

    const time = text.slice(element.label.length);
    const fits = bigWidth(time) <= run.width;
    if (!element.big || state !== "done" || !fits) {
        return (
            <div className={classNames("timer", element.className)} role="timer">
                <RevealText run={run} index={index} />
            </div>
        );
    }
    return (
        <div className={classNames("timer", "timer-big", element.className)} role="timer">
            <span className="sr-only">{text}</span>
            <div aria-hidden="true">
                {element.label.trim() && <div>{element.label.trimEnd()}</div>}
                <div className="timer-digits">{bigDigits(time).join("\n")}</div>
            </div>
        </div>
    );
}
