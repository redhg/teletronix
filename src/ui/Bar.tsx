import { useMemo } from "react";
import { type BarLine, breadcrumb, layoutBarLine } from "../engine/index.ts";
import { classNames } from "./element-view.ts";
import { useSound, useSoundToggle } from "./sound/context.ts";
import { useTerminal } from "./terminal-context.ts";
import "./bar.css";

interface Props {
    lines: readonly BarLine[];
    position: "header" | "footer";
    /** Characters per line, the same as the screen's, so the bars line up with it. */
    columns: number;
    /** The current screen, for a breadcrumb */
    screenId?: string;
}

/**
 * A header or status bar: lines pinned to the edge of the window. Its parent re-renders
 * whenever a variable changes, so the text shown stays current.
 */
export function Bar({ lines, position, columns, screenId }: Props) {
    const terminal = useTerminal();
    const sound = useSound();
    const toggle = useSoundToggle();
    const trail = useMemo(
        () => (screenId === undefined ? [] : breadcrumb(terminal.program, screenId)),
        [terminal, screenId],
    );

    return (
        <div className={classNames("bar", `bar-${position}`)}>
            {lines.map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a bar's lines never reorder
                <div key={index} className={classNames("bar-line", line.className)}>
                    {layoutBarLine(line, columns, terminal.format, {
                        trail,
                        soundToggle: toggle?.label,
                    }).map((piece, k) => {
                        const slot = piece.slot && line[piece.slot];
                        if (slot?.soundToggle && toggle) {
                            return (
                                <button
                                    // biome-ignore lint/suspicious/noArrayIndexKey: laid out afresh each time
                                    key={k}
                                    type="button"
                                    className={classNames("bar-link", slot.className, piece.style)}
                                    aria-label="Sound"
                                    aria-pressed={!toggle.muted}
                                    title={`Sound ${toggle.muted ? "off" : "on"} (Ctrl+M)`}
                                    onClick={toggle.toggle}
                                >
                                    {piece.text}
                                </button>
                            );
                        }
                        const action = piece.action ?? slot?.action;
                        if (!action) {
                            return (
                                <span
                                    // biome-ignore lint/suspicious/noArrayIndexKey: laid out afresh each time
                                    key={k}
                                    className={
                                        classNames(slot?.className, piece.style) || undefined
                                    }
                                >
                                    {piece.text}
                                </span>
                            );
                        }
                        return (
                            <button
                                // biome-ignore lint/suspicious/noArrayIndexKey: laid out afresh each time
                                key={k}
                                type="button"
                                className={classNames("bar-link", slot?.className, piece.style)}
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
