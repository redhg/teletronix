import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ElementList } from "../../ui/ElementList.tsx";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal, useTerminalSnapshot } from "../../ui/terminal-context.ts";
import {
    type CarouselElement,
    type CarouselMemory,
    counterText,
    currentSlide,
    stepSlide,
} from "./definition.ts";
import "./style.css";

/** Where the arrow keys are someone else's: fields, dialogs, and controls that use them. */
const ARROW_TARGETS =
    'input, textarea, dialog, [role="slider"], [role="menu"], .buttons, .map, .hexdump';

/** The carousel the player last flipped, which the arrow keys go to on a screen with several. */
let lastUsed: string | null = null;

/** Whether the arrow keys, pressed here, are for this carousel. */
function arrowsFor(id: string, target: EventTarget | null): boolean {
    const screen = document.querySelector(".screen:not(.outgoing)");
    const mine = screen?.querySelector(`[data-carousel="${CSS.escape(id)}"]`);
    if (!mine || document.querySelector("dialog[open]")) return false;
    const from = target instanceof Element ? target : null;
    const inside = from?.closest("[data-carousel]");
    if (inside) return inside === mine;
    if (from?.closest(ARROW_TARGETS)) return false;
    const used = lastUsed && screen?.querySelector(`[data-carousel="${CSS.escape(lastUsed)}"]`);
    return (used || screen?.querySelector("[data-carousel]")) === mine;
}

/**
 * The slide showing (revealed by the engine, as a run of its own), and a line of controls
 * under it: ◄ PREV, which slide this is, NEXT ►. The ← and → keys flip it too.
 */
export function CarouselView({ element, interactive, run }: ElementViewProps<CarouselElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    // (re-renders as the slide reveals, to know when it's finished)
    useTerminalSnapshot();
    const slide = currentSlide(element, terminal.recall<CarouselMemory>(element.id));
    const contents = run.contents(element.id);
    const before = stepSlide(element, slide, -1);
    const after = stepSlide(element, slide, 1);

    const flip = (to: number | null, byPlayer: boolean) => {
        if (to === null || to === slide) return;
        if (byPlayer) {
            lastUsed = element.id;
            setPlaying(false);
        }
        sound({ type: "select" });
        terminal.remember(element.id, to);
    };
    const flipRef = useRef(flip);
    flipRef.current = flip;

    useEffect(() => {
        if (!interactive) return;
        const onKey = (event: KeyboardEvent) => {
            const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
            if (!step || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey)
                return;
            if (!arrowsFor(element.id, event.target)) return;
            event.preventDefault();
            const current = currentSlide(element, terminal.recall<CarouselMemory>(element.id));
            flipRef.current(stepSlide(element, current, step), true);
        };
        // (first, before the screen takes the key for its "next" rules)
        window.addEventListener("keydown", onKey, { capture: true });
        return () => window.removeEventListener("keydown", onKey, { capture: true });
    }, [interactive, element, terminal]);

    // autoplay: on to the next slide a while after each has revealed, until the player flips
    const [playing, setPlaying] = useState(element.autoplay !== undefined);
    const revealed = contents !== null && contents.finishedAt !== null;
    useEffect(() => {
        if (!playing || !revealed || element.autoplay === undefined) return;
        const timer = setTimeout(() => flipRef.current(after, false), element.autoplay);
        return () => clearTimeout(timer);
    }, [playing, revealed, element.autoplay, after]);

    // as tall as the tallest slide shown so far, so flipping back doesn't move the screen
    const slides = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);
    useLayoutEffect(() => {
        const target = slides.current;
        if (!target) return;
        const grow = () => setHeight((was) => Math.max(was, target.scrollHeight));
        grow();
        const observer = new ResizeObserver(grow);
        for (const child of target.children) observer.observe(child);
        return () => observer.disconnect();
    });
    // (a narrower window rewraps the slides: start measuring again)
    const width = run.width;
    useLayoutEffect(() => {
        void width;
        setHeight(0);
    }, [width]);

    const counter = counterText(element, slide);
    return (
        <section
            className={classNames("carousel", element.className)}
            data-carousel={element.id}
            aria-roledescription="carousel"
            aria-label={counter || undefined}
        >
            <div
                ref={slides}
                className="carousel-slide"
                data-align={element.align}
                style={height ? { minHeight: `${height}px` } : undefined}
                aria-live={playing ? "off" : "polite"}
            >
                {contents && <ElementList run={contents} states={contents.states} />}
            </div>
            <div className="carousel-controls">
                <button
                    type="button"
                    className="control carousel-prev"
                    disabled={!interactive || before === null}
                    aria-label="Previous slide"
                    onClick={() => flip(before, true)}
                >
                    {element.prev}
                </button>
                {counter && <span className="carousel-counter">{counter}</span>}
                <button
                    type="button"
                    className="control carousel-next"
                    disabled={!interactive || after === null}
                    aria-label="Next slide"
                    onClick={() => flip(after, true)}
                >
                    {element.next}
                </button>
            </div>
        </section>
    );
}
