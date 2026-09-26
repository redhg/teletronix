import { useLayoutEffect, useRef } from "react";
import type { Frame, ScreenRun, SegmentKind } from "../engine/index.ts";

interface Props {
    run: ScreenRun;
    index: number;
}

/**
 * Renders an element's frames by writing straight to the DOM. The engine calls this
 * every animation frame, and React never re-renders for it.
 */
export function RevealText({ run, index }: Props) {
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
            if (full.current && full.current.textContent !== text) full.current.textContent = text;

            const texts: Record<SegmentKind, string> = { visible: "", cursor: "", hidden: "" };
            for (const segment of frame) texts[segment.kind] += segment.text;
            // a cursor on a line break would be invisible, so show it as a block first
            if (texts.cursor === "\n") texts.cursor = " \n";

            for (const kind of ["visible", "cursor", "hidden"] as const) {
                const span = spans[kind];
                if (span && span.textContent !== texts[kind]) span.textContent = texts[kind];
            }

            // keep the cursor on screen, checking only when it moves to a new line
            const span = spans.cursor;
            if (span && texts.cursor && span.offsetTop !== cursorTop) {
                cursorTop = span.offsetTop;
                span.scrollIntoView({ block: "nearest" });
            }
        });
    }, [run, index]);

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
