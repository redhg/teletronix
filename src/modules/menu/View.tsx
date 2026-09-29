import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import { LONG_PRESS_MS, useSecondaryPress } from "../link/use-secondary-press.ts";
import { highlighted, type MenuElement, type MenuItem, markerSpace } from "./definition.ts";
import "./style.css";

export function MenuView({ element, interactive, run, index }: ElementViewProps<MenuElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    const list = useRef<HTMLDivElement>(null);
    const [current, setCurrent] = useState(() =>
        highlighted(element, terminal.recall<number>(element.id)),
    );

    const move = (to: number, focus: boolean) => {
        const next = Math.min(Math.max(to, 0), element.items.length - 1);
        if (focus) list.current?.querySelectorAll("button")[next]?.focus();
        if (next === current) return;
        setCurrent(next);
        sound({ type: "tick" });
        terminal.remember(element.id, next);
    };

    // take the keyboard once it can be used (at the highlighted item), unless something else
    // already has it
    // biome-ignore lint/correctness/useExhaustiveDependencies: only when it becomes usable
    useEffect(() => {
        if (!interactive) return;
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active?.closest(".menu")) return;
        list.current?.querySelectorAll("button")[current]?.focus({ preventScroll: true });
    }, [interactive]);

    if (!interactive) {
        return (
            <div className={classNames("menu", element.className)}>
                <RevealText run={run} index={index} />
            </div>
        );
    }

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const moves: Record<string, number> = {
            ArrowUp: current - 1,
            ArrowDown: current + 1,
            Home: 0,
            End: element.items.length - 1,
        };
        const to = moves[event.key];
        if (to === undefined) return;
        event.preventDefault();
        move(to, true);
    };

    return (
        <div
            ref={list}
            className={classNames("menu", element.className)}
            role="menu"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
        >
            {element.items.map((item, i) => (
                <MenuItemButton
                    key={item.text + String(i)}
                    item={item}
                    marker={i === current ? `${element.marker} ` : markerSpace(element)}
                    selected={i === current}
                    onHover={() => move(i, false)}
                />
            ))}
        </div>
    );
}

interface ItemProps {
    item: MenuItem;
    marker: string;
    selected: boolean;
    onHover: () => void;
}

function MenuItemButton({ item, marker, selected, onHover }: ItemProps) {
    const terminal = useTerminal();
    const sound = useSound();
    const hasSecondary = item.secondaryAction !== undefined;
    const { holding, handlers } = useSecondaryPress(hasSecondary, (secondary) => {
        sound({ type: "select" });
        terminal.dispatch(secondary && item.secondaryAction ? item.secondaryAction : item.action);
    });

    return (
        <button
            type="button"
            role="menuitem"
            className={classNames(
                "menu-item control",
                selected && "selected",
                holding && "holding",
                item.className,
            )}
            style={{ "--hold-duration": `${LONG_PRESS_MS}ms` } as CSSProperties}
            aria-keyshortcuts={item.key}
            onPointerEnter={onHover}
            onFocus={onHover}
            {...handlers}
        >
            {marker}
            {item.text}
        </button>
    );
}
