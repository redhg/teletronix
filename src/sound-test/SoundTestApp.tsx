import { type KeyboardEvent, useEffect, useState } from "react";
import { Synth } from "../ui/sound/synth.ts";
import { BuiltInTab } from "./BuiltInTab.tsx";
import { CustomTab } from "./CustomTab.tsx";

const TABS = [
    { id: "builtin", label: "Built-in" },
    { id: "custom", label: "Custom" },
] as const;

type Tab = (typeof TABS)[number]["id"];

/** Tune Teletronix's own sounds (Built-in), or design new ones (Custom). */
export function SoundTestApp() {
    const [synth] = useState(() => new Synth());
    const [volume, setVolume] = useState(0.3);
    const [tab, setTab] = useState<Tab>(() => (location.hash === "#custom" ? "custom" : "builtin"));

    // the tab is in the address, so a reload stays on it
    useEffect(() => {
        history.replaceState(null, "", `${location.pathname}${location.search}#${tab}`);
    }, [tab]);

    const handleTabKey = (event: KeyboardEvent) => {
        const index = TABS.findIndex((t) => t.id === tab);
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        const next = TABS[(index + step + TABS.length) % TABS.length];
        if (next) {
            setTab(next.id);
            document.getElementById(`tab-${next.id}`)?.focus();
        }
    };

    return (
        <div className="sound-test">
            <header>
                <h1>Sound test</h1>
                <label className="row narrow">
                    <span>Volume</span>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={volume}
                        onChange={(e) => setVolume(Number(e.target.value))}
                    />
                    <output>{volume}</output>
                </label>
            </header>

            <div className="tabs" role="tablist" onKeyDown={handleTabKey}>
                {TABS.map(({ id, label }) => (
                    <button
                        key={id}
                        id={`tab-${id}`}
                        type="button"
                        role="tab"
                        aria-selected={tab === id}
                        aria-controls={`panel-${id}`}
                        tabIndex={tab === id ? 0 : -1}
                        onClick={() => setTab(id)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* both stay mounted, so switching tabs keeps edits (and a running hum) */}
            <section
                id="panel-builtin"
                role="tabpanel"
                aria-labelledby="tab-builtin"
                hidden={tab !== "builtin"}
            >
                <BuiltInTab synth={synth} volume={volume} />
            </section>
            <section
                id="panel-custom"
                role="tabpanel"
                aria-labelledby="tab-custom"
                hidden={tab !== "custom"}
            >
                <CustomTab synth={synth} />
            </section>
        </div>
    );
}
