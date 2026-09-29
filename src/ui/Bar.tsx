import { type BarLine, layoutBarLine } from "../engine/index.ts";
import { classNames } from "./element-view.ts";
import { useSound } from "./sound/context.ts";
import { useTerminal } from "./terminal-context.ts";
import "./bar.css";

interface Props {
    lines: readonly BarLine[];
    position: "header" | "footer";
    /** Characters per line, the same as the screen's, so the bars line up with it. */
    columns: number;
}

/**
 * A header or status bar: lines pinned to the edge of the window. Its parent re-renders
 * whenever a variable changes, so the text shown stays current.
 */
export function Bar({ lines, position, columns }: Props) {
    const terminal = useTerminal();
    const sound = useSound();

    return (
        <div className={classNames("bar", `bar-${position}`)}>
            {lines.map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a bar's lines never reorder
                <div key={index} className={classNames("bar-line", line.className)}>
                    {layoutBarLine(line, columns, terminal.format).map((piece, k) => {
                        const slot = piece.slot && line[piece.slot];
                        const action = slot?.action;
                        if (!action) {
                            return (
                                // biome-ignore lint/suspicious/noArrayIndexKey: laid out afresh each time
                                <span key={k} className={slot?.className}>
                                    {piece.text}
                                </span>
                            );
                        }
                        return (
                            <button
                                // biome-ignore lint/suspicious/noArrayIndexKey: laid out afresh each time
                                key={k}
                                type="button"
                                className={classNames("bar-link", slot.className)}
                                onClick={() => {
                                    sound({ type: "select" });
                                    terminal.dispatch(action);
                                }}
                            >
                                {piece.text}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
