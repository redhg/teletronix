import { useEffect, useState, useSyncExternalStore } from "react";
import type { Remote, RemoteStatus } from "./follow.ts";
import "./remote-badge.css";

/** How long the badge shows, at the start, after a change, or when asked for. */
const SHOW_MS = 10_000;

/** The badge's text: the pairing code, and whether a GM's panel is connected. */
export function badgeText({ code, network, gm }: RemoteStatus): string {
    if (network === "unavailable") return "REMOTE UNAVAILABLE: SERVE WITH npm run table";
    const state =
        network === "connected" ? (gm ? "GM CONNECTED" : "WAITING FOR GM") : "CONNECTING…";
    return `REMOTE ${code} · ${state}`;
}

/**
 * The terminal's pairing code in the corner, for a GM to type into their panel. It shows for
 * a while at the start and whenever the connection changes, and with Ctrl+Alt+G.
 */
export function RemoteBadge({ remote }: { remote: Remote }) {
    const status = useSyncExternalStore(remote.subscribe, remote.status);
    const [until, setUntil] = useState(() => Date.now() + SHOW_MS);
    const [, setNow] = useState(0);

    // shown again whenever the connection changes
    useEffect(() => {
        void status;
        setUntil(Date.now() + SHOW_MS);
    }, [status]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (!(event.ctrlKey && event.altKey) || event.code !== "KeyG") return;
            event.preventDefault();
            setUntil(Date.now() + SHOW_MS);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // hidden once its time is up
    useEffect(() => {
        const wait = until - Date.now();
        if (wait <= 0) return;
        const timer = setTimeout(() => setNow(Date.now()), wait);
        return () => clearTimeout(timer);
    }, [until]);

    if (!status.code || Date.now() >= until) return null;
    return (
        <div className="remote-badge" role="status">
            {badgeText(status)}
        </div>
    );
}
