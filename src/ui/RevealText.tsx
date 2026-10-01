import { useContext, useLayoutEffect, useRef } from "react";
import type { Frame, ScreenRun, SegmentKind } from "../engine/index.ts";
import { AutoscrollContext } from "./autoscroll.ts";

interface Props {
    run: ScreenRun;
    index: number;
    /**
     * What screen readers get instead of the element's text. For text that changes all
     * the time (e.g. a progress bar), which would otherwise be announced on every frame.
     */
    label?: string;
}

/**
 * Renders an element's frames by writing straight to the DOM. The engine calls this
 * every animation frame, and React never re-renders for it.
 */
export function RevealText({ run, index, label }: Props) {
    const autoscroll = useContext(AutoscrollContext);
    const full = useRef<HTMLSpanElement>(null);
    const visible = useRef<HTMLSpanElement>(null);
    const cursor = useRef<HTMLSpanElement>(null);
    const hidden = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
        const spans: Record<SegmentKind, HTMLSpanElement | null> = {
            visible: visible.current,
            cursor: cursor.current,
            hidden: hidden.current,
        };
        let cursorTop: number | null = null;

        return run.subscribeFrame(index, (frame: Frame, text: string) => {
            // screen readers get the whole text, never a half-revealed frame
            const spoken = label ?? text;
            if (full.current && full.current.textContent !== spoken) {
                full.current.textContent = spoken;
            }

            const texts: Record<SegmentKind, string> = { visible: "", cursor: "", hidden: "" };
            // inline styles: the visible text's styled stretches, and the cursor's
            const styled: { text: string; style?: string }[] = [];
            let cursorStyle = "";
            for (const segment of frame) {
                texts[segment.kind] += segment.text;
                if (segment.kind === "visible") {
                    const last = styled.at(-1);
                    if (last && last.style === segment.style) last.text += segment.text;
                    else styled.push({ text: segment.text, style: segment.style });
                }
                if (segment.kind === "cursor" && segment.style) cursorStyle = segment.style;
            }
            // a cursor on a line break would be invisible, so show it as a block first
            if (texts.cursor === "\n") texts.cursor = " \n";

            for (const kind of ["cursor", "hidden"] as const) {
                const span = spans[kind];
                if (span && span.textContent !== texts[kind]) span.textContent = texts[kind];
            }
            const cursorClass = cursorStyle ? `reveal-cursor ${cursorStyle}` : "reveal-cursor";
            if (spans.cursor && spans.cursor.className !== cursorClass) {
                spans.cursor.className = cursorClass;
            }
            const shown = spans.visible;
            const styleKey = styled
                .map((part) => `${part.style ?? ""}|${part.text}`)
                .join("\u0000");
            if (shown && styled.some((part) => part.style)) {
                // (rebuilt only when it changes)
                if (shown.dataset.styled !== styleKey) {
                    shown.dataset.styled = styleKey;
                    shown.replaceChildren(
                        ...styled.map((part) => {
                            if (!part.style) return document.createTextNode(part.text);
                            const span = document.createElement("span");
                            span.className = part.style;
                            span.textContent = part.text;
                            return span;
                        }),
                    );
                }
            } else if (shown && (shown.dataset.styled || shown.textContent !== texts.visible)) {
                delete shown.dataset.styled;
                shown.textContent = texts.visible;
            }

            // the cursor moved to a new line: let the autoscroller keep it in view
            const span = spans.cursor;
            if (span && texts.cursor && span.offsetTop !== cursorTop) {
                cursorTop = span.offsetTop;
                autoscroll?.follow();
            }
        });
    }, [run, index, label, autoscroll]);

    return (
        <>
            <span ref={full} className="sr-only" />
            <span aria-hidden="true">
                <span ref={visible} />
                <span ref={cursor} className="reveal-cursor" />
                <span ref={hidden} className="reveal-hidden" />
            </span>
        </>
    );
}
