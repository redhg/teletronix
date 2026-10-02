import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal, useTerminalSnapshot } from "../../ui/terminal-context.ts";
import {
    allItems,
    ancestors,
    itemAction,
    openFolders,
    rowText,
    type TreeElement,
    type TreeMemory,
    type TreeRow,
    treeRows,
} from "./definition.ts";
import "./style.css";

/**
 * A tree of items. Once it can be used, each line is an item to move to with the arrow keys
 * (or click): folders open and close, and items open their screen.
 */
export function TreeView({ element, interactive, run, index }: ElementViewProps<TreeElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    // (re-renders when its memory, or what its frame shows, changes)
    useTerminalSnapshot();
    const open = openFolders(element, terminal.recall<TreeMemory>(element.id));
    const rows = treeRows(element, open);

    // the item showing in its frame
    const showing = element.frame === undefined ? undefined : terminal.frameShowing(element.frame);
    const current =
        showing === undefined
            ? undefined
            : allItems(element).find(({ item }) => item.screen === showing)?.path;

    const remember = (paths: Iterable<string>) =>
        terminal.remember(element.id, { open: [...paths] } satisfies TreeMemory);

    // an item opened from elsewhere (e.g. a link in the frame) shows, its folders opened
    // biome-ignore lint/correctness/useExhaustiveDependencies: only when it changes
    useEffect(() => {
        if (current === undefined) return;
        const closed = ancestors(current).filter((path) => !open.has(path));
        if (closed.length > 0) remember([...open, ...closed]);
    }, [current]);

    // the item the keyboard is on
    const [focus, setFocus] = useState(() => current ?? rows[0]?.path ?? "0");
    const at = rows.find((row) => row.path === focus) ?? rows[0];
    const box = useRef<HTMLDivElement>(null);
    const focusRow = (path: string) => {
        setFocus(path);
        const row = box.current?.querySelector<HTMLElement>(`[data-path="${path}"]`);
        row?.scrollIntoView({ block: "nearest" });
        row?.focus({ preventScroll: true });
    };

    // take the keyboard once it can be used, unless something else already has it
    useEffect(() => {
        if (!interactive) return;
        const active = document.activeElement;
        if (active && active !== document.body) return;
        box.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true });
    }, [interactive]);

    if (!interactive) {
        return (
            <div className={classNames("tree", element.className)}>
                <RevealText run={run} index={index} />
            </div>
        );
    }

    const toggle = (row: TreeRow) => {
        const next = new Set(open);
        if (row.isOpen) next.delete(row.path);
        else next.add(row.path);
        sound({ type: "select" });
        remember(next);
    };
    const activate = (row: TreeRow) => {
        if (row.folder) {
            toggle(row);
            return;
        }
        const action = itemAction(element, row.item);
        if (!action) return;
        sound({ type: "select" });
        terminal.dispatch(action);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!at || event.altKey || event.ctrlKey || event.metaKey) return;
        const position = rows.indexOf(at);
        const go = (to: number) => {
            const row = rows[Math.min(Math.max(to, 0), rows.length - 1)];
            if (row && row !== at) sound({ type: "tick" });
            if (row) focusRow(row.path);
        };
        const handlers: Record<string, () => void> = {
            ArrowDown: () => go(position + 1),
            ArrowUp: () => go(position - 1),
            Home: () => go(0),
            End: () => go(rows.length - 1),
            // into a folder: open it, then step in
            ArrowRight: () => {
                if (at.folder && !at.isOpen) toggle(at);
                else if (at.isOpen) go(position + 1);
            },
            // out of one: close it, or step out to the folder it's in
            ArrowLeft: () => {
                if (at.isOpen) toggle(at);
                else {
                    const parent = ancestors(at.path).at(-1);
                    if (parent !== undefined) focusRow(parent);
                }
            },
            Enter: () => activate(at),
            " ": () => activate(at),
        };
        const handler = handlers[event.key];
        if (!handler) return;
        event.preventDefault();
        handler();
    };

    return (
        <div
            ref={box}
            className={classNames("tree", element.className)}
            role="tree"
            onKeyDown={handleKeyDown}
        >
            {rows.map((row) => {
                const marked = row.path === current;
                const text = rowText(element, row);
                return (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: the tree takes the keys for its items
                    <div
                        key={row.path}
                        data-path={row.path}
                        role="treeitem"
                        aria-level={row.depth + 1}
                        aria-expanded={row.folder ? row.isOpen : undefined}
                        aria-current={marked ? "page" : undefined}
                        // one item at a time takes the keyboard
                        tabIndex={row === at ? 0 : -1}
                        className={classNames(
                            "tree-row",
                            marked && "tree-current",
                            row.item.className,
                        )}
                        onClick={() => {
                            setFocus(row.path);
                            activate(row);
                        }}
                        onFocus={() => setFocus(row.path)}
                    >
                        <span aria-hidden="true">{row.prefix}</span>
                        <span className="tree-text">{text.slice(row.prefix.length)}</span>
                        {marked && <span className="tree-mark">{element.current}</span>}
                    </div>
                );
            })}
        </div>
    );
}
