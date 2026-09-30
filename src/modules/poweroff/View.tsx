import { useLayoutEffect, useRef } from "react";
import type { ElementViewProps } from "../../ui/element-view.ts";
import { useSound } from "../../ui/sound/context.ts";
import type { PowerOffElement } from "./definition.ts";
import "./style.css";

/**
 * Nothing of its own: it switches off the screen it's on, collapsing it towards the middle
 * of the window (the page may be scrolled, so that's not always the middle of the screen).
 */
export function PowerOffView({ element, state }: ElementViewProps<PowerOffElement>) {
    const ref = useRef<HTMLDivElement>(null);
    const sound = useSound();
    const { delay, duration } = element;

    useLayoutEffect(() => {
        const screen = ref.current?.closest<HTMLElement>(".screen");
        if (!screen || (state !== "active" && state !== "done")) return;
        if (state === "done") {
            // finished, or skipped to the end: dark at once
            screen.classList.remove("powering-off");
            screen.classList.add("powered-off");
            return;
        }
        const top = screen.getBoundingClientRect().top;
        screen.style.transformOrigin = `50% ${window.innerHeight / 2 - top}px`;
        // on the page, so the bars (outside the screen) go dark in time with it
        const root = document.documentElement.style;
        root.setProperty("--power-delay", `${delay}ms`);
        root.setProperty("--power-duration", `${duration}ms`);
        screen.classList.add("powering-off");
        const click = setTimeout(() => sound({ type: "static", duration: 150 }), delay);
        return () => clearTimeout(click);
    }, [state, delay, duration, sound]);

    // switching back on is a new screen, but if this one stays (e.g. its `if` changed), undo it
    useLayoutEffect(() => {
        const screen = ref.current?.closest<HTMLElement>(".screen");
        return () => screen?.classList.remove("powering-off", "powered-off");
    }, []);

    return <div ref={ref} className="power-off" aria-hidden="true" />;
}
