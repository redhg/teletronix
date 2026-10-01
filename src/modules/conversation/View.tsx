import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { parseMarkup } from "../../engine/index.ts";
import { AutoscrollContext } from "../../ui/autoscroll.ts";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { StyledText } from "../../ui/StyledText.tsx";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal, useTerminalSnapshot } from "../../ui/terminal-context.ts";
import {
    type ConversationElement,
    type ConversationMemory,
    type ConversationReply,
    offered,
} from "./definition.ts";
import "./style.css";

interface Entry {
    who: "computer" | "you";
    text: string;
}

/**
 * The conversation so far, the line being typed, then the replies to choose from: by
 * clicking, or by number. A click, Enter or Space while it's typing finishes the line.
 */
export function ConversationView({ element, state }: ElementViewProps<ConversationElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    const autoscroll = useContext(AutoscrollContext);
    const dialog = useTerminalSnapshot().dialog !== null;
    const box = useRef<HTMLDivElement>(null);
    const instant = useRef(
        typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
    );

    const [log, setLog] = useState<Entry[]>([]);
    // lines still to say, and how much of the one being said is out
    const [queue, setQueue] = useState<string[]>([]);
    const [typed, setTyped] = useState<number | null>(null);
    const [node, setNode] = useState<string | null>(null);
    const [phase, setPhase] = useState<"speaking" | "choosing" | "ended">("speaking");
    const [used, setUsed] = useState<string[]>(
        () => terminal.recall<ConversationMemory>(element.id)?.used ?? [],
    );

    const arrive = (id: string) => {
        const lines = element.nodes[id]?.say ?? [];
        setNode(id);
        setQueue(lines.map((line) => `${element.speaker}${terminal.format(line)}`));
        setPhase("speaking");
    };

    // it starts once it has appeared
    const started = state === "active" || state === "done";
    useEffect(() => {
        if (!started || node !== null) return;
        const lines = element.nodes[element.start]?.say ?? [];
        setNode(element.start);
        setQueue(lines.map((line) => `${element.speaker}${terminal.format(line)}`));
        setPhase("speaking");
    }, [started, node, element, terminal]);

    // the next line, once the last is out
    useEffect(() => {
        if (phase !== "speaking" || typed !== null) return;
        const [line, ...rest] = queue;
        if (line !== undefined) {
            setLog((before) => [...before, { who: "computer", text: line }]);
            setQueue(rest);
            setTyped(instant.current || element.speed === 0 ? Number.POSITIVE_INFINITY : 0);
            return;
        }
        if (node === null) return;
        // everything's said: what happens here, then the replies (or the end)
        const action = element.nodes[node]?.action;
        if (action) terminal.dispatch(action);
        setPhase(offered(element, node, used, terminal.holds).length > 0 ? "choosing" : "ended");
    }, [phase, typed, queue, node, element, terminal, used]);

    // typing the line out
    const current = log.at(-1);
    const length = current ? parseMarkup(current.text).text.length : 0;
    useEffect(() => {
        if (typed === null) return;
        if (typed >= length) {
            setTyped(null);
            return;
        }
        const timer = window.setTimeout(() => {
            setTyped((n) => (n === null ? null : n + 1));
            sound({ type: "key" });
        }, element.speed);
        return () => clearTimeout(timer);
    }, [typed, length, element.speed, sound]);

    // keep up with it: each line, each character, and the replies
    useLayoutEffect(() => {
        if (log.length === 0 && typed === null && phase === "speaking") return;
        autoscroll?.follow();
    }, [log, typed, phase, autoscroll]);

    // the replies take the keyboard, so the number keys work
    useEffect(() => {
        if (phase === "choosing" && !dialog) box.current?.focus({ preventScroll: true });
    }, [phase, dialog]);

    const choose = (reply: ConversationReply, key: string) => {
        if (phase !== "choosing") return;
        sound({ type: "select" });
        setLog((before) => [
            ...before,
            { who: "you", text: `${element.you}${terminal.format(reply.text)}` },
        ]);
        if (reply.once) {
            const next = [...used, key];
            setUsed(next);
            terminal.remember(element.id, { used: next } satisfies ConversationMemory);
        }
        if (reply.next !== undefined) arrive(reply.next);
        else setPhase("ended");
        if (reply.action) terminal.dispatch(reply.action);
    };

    const finishLine = () => {
        if (typed !== null) setTyped(Number.POSITIVE_INFINITY);
    };
    const replies =
        node && phase === "choosing" ? offered(element, node, used, terminal.holds) : [];
    // (listeners on the element itself, kept up to date with what they need)
    const handlers = useRef({
        key: (_event: globalThis.KeyboardEvent) => {},
        pointer: (_event: PointerEvent) => {},
    });
    handlers.current.key = (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (typed !== null && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            finishLine();
            return;
        }
        const number = Number.parseInt(event.key, 10);
        const chosen = replies[number - 1];
        if (chosen) {
            event.preventDefault();
            choose(chosen.reply, chosen.key);
        }
    };
    handlers.current.pointer = (event) => {
        if (typed === null) return;
        // a click while it speaks finishes the line, rather than skipping the screen
        event.stopPropagation();
        finishLine();
    };
    useEffect(() => {
        const target = box.current;
        if (!target) return;
        const onKey = (event: globalThis.KeyboardEvent) => handlers.current.key(event);
        const onPointer = (event: PointerEvent) => handlers.current.pointer(event);
        target.addEventListener("keydown", onKey);
        target.addEventListener("pointerdown", onPointer);
        return () => {
            target.removeEventListener("keydown", onKey);
            target.removeEventListener("pointerdown", onPointer);
        };
    }, []);

    return (
        <div
            ref={box}
            className={classNames("conversation", element.className)}
            // (focusable, so the number keys choose a reply)
            tabIndex={-1}
        >
            {log.map((entry, i) => (
                <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: a transcript only grows
                    key={i}
                    className={classNames(
                        "conversation-line",
                        entry.who === "you" && "conversation-you",
                    )}
                >
                    <StyledText
                        text={entry.text}
                        limit={i === log.length - 1 && typed !== null ? typed : undefined}
                    />
                    {i === log.length - 1 && typed !== null && (
                        <span className="reveal-cursor"> </span>
                    )}
                </div>
            ))}
            {replies.length > 0 && (
                <div className="conversation-replies">
                    {replies.map(({ reply, key }, i) => (
                        <button
                            key={key}
                            type="button"
                            className="link control"
                            onClick={() => choose(reply, key)}
                        >
                            {`${i + 1}. `}
                            <StyledText text={terminal.format(reply.text)} />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
