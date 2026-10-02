import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";

export interface Tab {
    id: string;
    label: string;
    content: ReactNode;
}

/** The tab last open, so the panel opens where the GM left it. */
function savedTab(key: string, tabs: readonly Tab[]): string {
    try {
        const saved = localStorage.getItem(key);
        if (saved && tabs.some((tab) => tab.id === saved)) return saved;
    } catch {
        // not remembered
    }
    return tabs[0]?.id ?? "";
}

/**
 * Tabs: a row of buttons, each showing its panel. <left> and <right> move between them
 * (the usual keys for tabs). Every panel stays mounted, so what's typed in one stays put.
 */
export function Tabs({ tabs, storageKey }: { tabs: readonly Tab[]; storageKey: string }) {
    const [current, setCurrent] = useState(() => savedTab(storageKey, tabs));
    const base = useId();
    const list = useRef<HTMLDivElement>(null);
    const choose = (id: string, focus = false) => {
        setCurrent(id);
        try {
            localStorage.setItem(storageKey, id);
        } catch {
            // not remembered
        }
        if (focus) list.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus();
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const at = tabs.findIndex((tab) => tab.id === current);
        const to = {
            ArrowRight: (at + 1) % tabs.length,
            ArrowLeft: (at - 1 + tabs.length) % tabs.length,
            Home: 0,
            End: tabs.length - 1,
        }[event.key];
        const tab = to === undefined ? undefined : tabs[to];
        if (!tab) return;
        event.preventDefault();
        choose(tab.id, true);
    };

    return (
        <>
            <div ref={list} className="gm-tabs" role="tablist" onKeyDown={handleKeyDown}>
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        id={`${base}-${tab.id}-tab`}
                        data-tab={tab.id}
                        aria-selected={tab.id === current}
                        aria-controls={`${base}-${tab.id}`}
                        tabIndex={tab.id === current ? 0 : -1}
                        onClick={() => choose(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            {tabs.map((tab) => (
                <div
                    key={tab.id}
                    role="tabpanel"
                    id={`${base}-${tab.id}`}
                    aria-labelledby={`${base}-${tab.id}-tab`}
                    className="gm-tabpanel"
                    hidden={tab.id !== current}
                >
                    {tab.content}
                </div>
            ))}
        </>
    );
}
