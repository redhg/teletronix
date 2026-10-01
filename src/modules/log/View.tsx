import { useContext, useEffect, useLayoutEffect, useState } from "react";
import { AutoscrollContext } from "../../ui/autoscroll.ts";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { StyledText } from "../../ui/StyledText.tsx";
import { useTerminal } from "../../ui/terminal-context.ts";
import { clockSeconds, type LogElement, passOrder, stamp } from "./definition.ts";
import "./style.css";

/** The lines so far, one more every so often, while the screen is showing. */
export function LogView({ element, state }: ElementViewProps<LogElement>) {
    const terminal = useTerminal();
    const autoscroll = useContext(AutoscrollContext);
    const [lines, setLines] = useState<string[]>([]);
    const started = state === "active" || state === "done";

    useEffect(() => {
        if (!started) return;
        const begun = performance.now();
        const base = element.time === undefined ? 0 : clockSeconds(element.time);
        let order = passOrder(element, Math.random);
        let next = 0;
        let timer = 0;
        const keep = element.rows ?? (element.loop ? 10 : Number.POSITIVE_INFINITY);
        const add = () => {
            if (next >= order.length) {
                if (!element.loop) return;
                order = passOrder(element, Math.random);
                next = 0;
            }
            const text = terminal.format(element.lines[order[next] ?? 0] ?? "");
            next++;
            const line =
                element.time === undefined
                    ? text
                    : `${stamp(base + (performance.now() - begun) / 1000)} ${text}`;
            setLines((before) => [...before, line].slice(-keep));
            // a little sooner or later each time
            timer = window.setTimeout(add, element.interval * (0.5 + Math.random()));
        };
        add();
        return () => clearTimeout(timer);
    }, [started, element, terminal]);

    useLayoutEffect(() => {
        if (lines.length > 0) autoscroll?.follow();
    }, [lines, autoscroll]);

    return (
        <div className={classNames("log", element.className)} role="log">
            {lines.map((line, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines only arrive, in order
                <div key={i} className="log-line">
                    <StyledText text={line} />
                </div>
            ))}
        </div>
    );
}
