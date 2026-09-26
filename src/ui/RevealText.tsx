import { useLayoutEffect, useRef } from "react";
import type { Frame, ScreenRun, SegmentKind } from "../engine/index.ts";

interface Props {
    run: ScreenRun;
    index: number;
    /** The element's full text, for screen readers. */
    text: string;
}

/**
 * Renders an element's frames by writing straight to the DOM. The engine calls this
 * every animation frame, and React never re-renders for it.
 */
export function RevealText({ run, index, text }: Props) {
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

        return run.subscribeFrame(index, (frame: Frame) => {
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
            <span className="sr-only">{text}</span>
            <span aria-hidden="true">
                <span ref={visible} />
                <span ref={cursor} className="cursor" />
                <span ref={hidden} className="hidden" />
            </span>
        </>
    );
}
