import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import {
    type SliderElement,
    type SliderMemory,
    sliderClasses,
    sliderValue,
    snapValue,
    valueAt,
} from "./definition.ts";
import "./style.css";

export function SliderView({ element, interactive, run, index }: ElementViewProps<SliderElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    const ref = useRef<HTMLDivElement>(null);
    const current = () => sliderValue(element, terminal.recall<SliderMemory>(element.id));
    // kept in state for the ARIA attributes and range classes; the bar redraws through the
    // engine, which also says when the value changes some other way (e.g. a bound variable)
    const [value, setValue] = useState(current);
    useEffect(
        () =>
            run.subscribeFrame(index, () =>
                setValue(sliderValue(element, terminal.recall<SliderMemory>(element.id))),
            ),
        [run, index, element, terminal],
    );
    const label = element.label?.trim() || "Slider";
    const className = classNames(
        "slider control",
        element.className,
        ...sliderClasses(element, value),
    );
    const content = <RevealText run={run} index={index} label={label} />;

    if (!interactive) {
        return <div className={className}>{content}</div>;
    }

    const set = (next: number) => {
        const snapped = snapValue(element, next);
        if (snapped === current()) return;
        setValue(snapped);
        sound({ type: "tick" });
        terminal.remember(element.id, snapped);
    };

    // where along the bar a pointer is, measured from the drawn text so it matches the cells
    const setFromPointer = (event: PointerEvent) => {
        const text = ref.current?.querySelector('[aria-hidden="true"]');
        if (!text?.textContent) return;
        const range = document.createRange();
        range.selectNodeContents(text);
        const box = range.getBoundingClientRect();
        const line = text.textContent;
        const charWidth = box.width / line.length;
        const barStart = (element.label ?? "").length + 1;
        const barEnd = line.indexOf("]", barStart);
        if (charWidth <= 0 || barEnd <= barStart) return;
        const cell = (event.clientX - box.left) / charWidth;
        set(valueAt(element, (cell - barStart) / (barEnd - barStart)));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
        const big = Math.max(element.step, (element.max - element.min) / 10);
        const moves: Record<string, () => number> = {
            ArrowRight: () => current() + element.step,
            ArrowUp: () => current() + element.step,
            ArrowLeft: () => current() - element.step,
            ArrowDown: () => current() - element.step,
            PageUp: () => current() + big,
            PageDown: () => current() - big,
            Home: () => element.min,
            End: () => element.max,
        };
        const move = moves[event.key];
        if (move) {
            event.preventDefault();
            set(move());
        } else if (event.key === "Enter" && element.onEnter) {
            event.preventDefault();
            sound({ type: "select" });
            terminal.dispatch(element.onEnter);
        }
    };

    return (
        <div
            ref={ref}
            className={className}
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-valuemin={element.min}
            aria-valuemax={element.max}
            aria-valuenow={value}
            aria-valuetext={`${value}${element.unit}`}
            onKeyDown={handleKeyDown}
            onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                setFromPointer(event);
            }}
            onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) setFromPointer(event);
            }}
        >
            {content}
        </div>
    );
}
