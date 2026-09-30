import { useEffect, useRef } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import { type CrashElement, CrashGrid } from "./definition.ts";
import "./style.css";

/** Milliseconds for the corruption to take hold. */
const RAMP = 2000;

/**
 * Garbage over the whole window, changing a dozen times a second until the screen goes. With
 * reduced motion it's one still picture. Screen readers get the message, once.
 */
export function CrashView({ element }: ElementViewProps<CrashElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    const box = useRef<HTMLDivElement>(null);
    const text = useRef<HTMLPreElement>(null);
    const probe = useRef<HTMLSpanElement>(null);
    const { message, fragments } = element;

    useEffect(() => {
        const pre = text.current;
        const frame = box.current;
        if (!pre || !frame) return;
        const size = () => {
            const width = (probe.current?.getBoundingClientRect().width ?? 1000) / 100;
            const lineHeight = Number.parseFloat(getComputedStyle(pre).lineHeight) || 20;
            return {
                columns: Math.max(1, Math.floor(pre.clientWidth / width)),
                rows: Math.max(1, Math.floor(pre.clientHeight / lineHeight)),
            };
        };
        const before = terminal.previousText;
        const grid = new CrashGrid({
            ...size(),
            start: before,
            fragments: fragments ?? before.split("\n").filter((line) => line.trim() !== ""),
            message,
        });
        const draw = () => {
            pre.textContent = grid.toString();
        };

        if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
            for (let i = 0; i < 60; i++) grid.corrupt();
            grid.showMessage();
            draw();
            return;
        }

        const started = performance.now();
        let nextMessage = started + 1500;
        let nextSound = started;
        let timer = 0;
        const tick = () => {
            const now = performance.now();
            grid.corrupt(Math.min(1, (now - started) / RAMP));
            if (now >= nextMessage) {
                // readable for about a second, then it breaks up with the rest
                grid.showMessage(10);
                nextMessage = now + 2000 + Math.random() * 2500;
            }
            if (now >= nextSound) {
                sound({ type: "glitch", duration: 100 + Math.random() * 300 });
                nextSound = now + 1200 + Math.random() * 3000;
            }
            // now and then, the picture slips sideways
            frame.style.translate =
                Math.random() < 0.1 ? `${Math.round(Math.random() * 8 - 4)}px` : "";
            draw();
            timer = window.setTimeout(tick, 50 + Math.random() * 90);
        };
        tick();

        const observer = new ResizeObserver(() => {
            const { columns, rows } = size();
            grid.resize(columns, rows);
            draw();
        });
        observer.observe(pre);
        return () => {
            clearTimeout(timer);
            observer.disconnect();
        };
    }, [terminal, sound, message, fragments]);

    return (
        <div ref={box} className={classNames("crash", element.className)}>
            <div className="sr-only" role="alert">
                {message.join(" ")}
            </div>
            <pre ref={text} aria-hidden="true" />
            <span ref={probe} className="crash-probe" aria-hidden="true">
                {"0".repeat(100)}
            </span>
        </div>
    );
}
