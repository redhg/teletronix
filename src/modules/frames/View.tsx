import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ElementList } from "../../ui/ElementList.tsx";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { type FrameElement, type FramesElement, frameLayout, frameTop } from "./definition.ts";
import "./style.css";

/** The frames, side by side (or stacked, on a narrow screen). */
export function FramesView({ element, run }: ElementViewProps<FramesElement>) {
    const group = run.contents(element.id);
    if (!group) return null;
    const { stacked } = frameLayout(element.frames, run.width);
    return (
        <div
            className={classNames("frames", stacked && "frames-stacked", element.className)}
            style={stacked ? undefined : { columnGap: `${element.gap}ch` }}
        >
            <ElementList run={group} states={group.states} />
        </div>
    );
}

/** How far a frame can scroll: whether there's more above, and more below. */
interface More {
    above: boolean;
    below: boolean;
}

/**
 * A frame: its border, and its contents in a box `rows` lines tall that scrolls by itself,
 * following the text as it types in until the player scrolls it.
 */
export function FrameView({ element, run }: ElementViewProps<FrameElement>) {
    const contents = run.contents(element.id);
    const frames = run.elements.filter((e): e is FrameElement => e.type === "frame");
    const { widths } = frameLayout(frames, run.width);
    const width = widths[frames.indexOf(element)] ?? run.width;

    const scroller = useRef<HTMLDivElement>(null);
    const following = useRef(element.autoscroll);
    // where it last scrolled itself to: a scroll event can arrive after more text has
    const placed = useRef(0);
    const [more, setMore] = useState<More>({ above: false, below: false });
    const measure = useCallback(() => {
        const box = scroller.current;
        if (!box) return;
        const above = box.scrollTop > 1;
        const below = box.scrollTop + box.clientHeight < box.scrollHeight - 1;
        setMore((was) => (was.above === above && was.below === below ? was : { above, below }));
    }, []);

    // as its contents grow, keep the newest in view (unless the player has scrolled away)
    useLayoutEffect(() => {
        const box = scroller.current;
        const inner = box?.firstElementChild;
        if (!box || !inner) return;
        const follow = () => {
            if (following.current) {
                box.scrollTop = box.scrollHeight;
                placed.current = box.scrollTop;
            }
            measure();
        };
        follow();
        const observer = new ResizeObserver(follow);
        observer.observe(inner);
        observer.observe(box);
        return () => observer.disconnect();
    }, [measure]);

    // a new screen shown in it starts at the top, following its text
    useLayoutEffect(() => {
        const box = scroller.current;
        if (!box || !contents) return;
        following.current = element.autoscroll;
        box.scrollTop = 0;
        placed.current = 0;
        measure();
    }, [contents, element.autoscroll, measure]);

    // scrolling it back to the bottom follows again; away from it stops following
    useEffect(() => {
        const box = scroller.current;
        if (!box) return;
        const onScroll = () => {
            if (element.autoscroll) {
                // up from where it put itself: the player's scrolling, so stop following;
                // back to the bottom: follow again. (Within a line of it: a line can arrive
                // between the player's scroll and its event, and it'd seem a line short.)
                const line = Number.parseFloat(getComputedStyle(box).lineHeight) || 0;
                const bottom = box.scrollTop + box.clientHeight >= box.scrollHeight - line - 2;
                if (bottom) following.current = true;
                else if (box.scrollTop < placed.current - 2) following.current = false;
                placed.current = Math.min(placed.current, box.scrollTop);
            }
            measure();
        };
        box.addEventListener("scroll", onScroll, { passive: true });
        return () => box.removeEventListener("scroll", onScroll);
    }, [element.autoscroll, measure]);

    const top = frameTop(element, width);
    const side = (end: string, first: string, last: string) =>
        Array.from({ length: element.rows }, (_, row) =>
            row === 0 ? first : row === element.rows - 1 ? last : end,
        ).join("\n");

    const body = (
        <div
            ref={scroller}
            className="frame-scroll"
            // (focusable, so the keyboard can scroll it)
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region takes the keyboard
            tabIndex={0}
            style={{ height: `${element.rows}lh` }}
        >
            <div className="frame-content">
                {contents && <ElementList run={contents} states={contents.states} />}
            </div>
        </div>
    );

    return (
        <section
            className={classNames("frame", element.border && "frame-bordered", element.className)}
            style={{ width: `${width}ch` }}
            aria-label={element.title}
        >
            {element.border ? (
                <>
                    <div className="frame-edge" aria-hidden="true">
                        {top.before}
                        {top.title && <span className="frame-title">{top.title}</span>}
                        {top.after}
                    </div>
                    <div className="frame-body">
                        <div className="frame-side" aria-hidden="true">
                            {side("│ ", "│ ", "│ ")}
                        </div>
                        {body}
                        <div className="frame-side" aria-hidden="true">
                            {side(" │", more.above ? " ▲" : " │", more.below ? " ▼" : " │")}
                        </div>
                    </div>
                    <div className="frame-edge" aria-hidden="true">
                        {`└${"─".repeat(Math.max(0, width - 2))}┘`}
                    </div>
                </>
            ) : (
                body
            )}
        </section>
    );
}
