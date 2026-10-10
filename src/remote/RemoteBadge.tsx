import { type FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cleanJoinCode } from "./codes.ts";
import type { Remote, RemoteStatus } from "./follow.ts";
import { isLocalHost } from "./relay-address.ts";
import type { Refusal } from "./relay-protocol.ts";
import "./remote-badge.css";

/** How long the badge shows, at the start, after a change, or when asked for. */
const SHOW_MS = 10_000;

/** The badge's text: the session, and whether a GM's panel is connected. */
export function badgeText({ code, network, gm }: RemoteStatus): string {
    if (network === "unavailable") {
        // (served from here, its relay's beside it; online, it's Teletronix's, on the internet)
        return isLocalHost(location.hostname)
            ? "SESSIONS UNAVAILABLE: SERVE WITH npm run table"
            : "SESSIONS UNAVAILABLE: CAN'T REACH THE RELAY";
    }
    const state =
        network === "connected" ? (gm ? "GM CONNECTED" : "WAITING FOR GM") : "CONNECTING…";
    return `SESSION ${code} · ${state}`;
}

/** Why a session wouldn't have this device, as the join prompt says it. */
const REFUSED: Record<Refusal, string> = {
    removed: "THE GM TOOK THIS DEVICE OUT OF THE SESSION.",
    "too-many": "TOO MANY TRIES. WAIT A MINUTE, THEN TRY AGAIN.",
    invalid: "THAT ISN'T A SESSION CODE.",
    taken: "THAT SESSION ISN'T AVAILABLE.",
};

/**
 * The session in the corner: shown for a while at the start and whenever the connection
 * changes, and with Ctrl+Alt+G. And, while it has no code to join with, a prompt for one.
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

    if (status.asking) return <JoinPrompt remote={remote} refused={status.refused} />;
    const shown = status.code || status.network === "unavailable";
    if (!shown || Date.now() >= until) return null;
    return (
        <div className="remote-badge" role="status">
            {badgeText(status)}
        </div>
    );
}

/** "bcdf12" → "BCDF-12": the code as it's typed, with its dash. */
const formatTyped = (typed: string) => {
    const plain = typed
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 8);
    return plain.length > 4 ? `${plain.slice(0, 4)}-${plain.slice(4)}` : plain;
};

/** Asks for the GM's session code, to join it (or to play on without one). */
function JoinPrompt({ remote, refused }: { remote: Remote; refused: Refusal | null }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [typed, setTyped] = useState("");
    const [problem, setProblem] = useState<string | null>(null);

    useEffect(() => {
        const element = dialog.current;
        if (element && !element.open) element.showModal();
        return () => element?.close();
    }, []);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!remote.join(typed)) {
            setProblem("FOUR LETTERS, THEN FOUR DIGITS: E.G. BCDF-1234.");
        }
    };
    const message = problem ?? (refused ? REFUSED[refused] : null);
    return (
        <dialog
            ref={dialog}
            className="join-prompt"
            aria-labelledby="join-title"
            // (Esc plays on without joining)
            onCancel={() => remote.dismiss()}
        >
            <form onSubmit={submit}>
                <p id="join-title">JOIN A GM'S SESSION</p>
                <label>
                    CODE:{" "}
                    <input
                        autoFocus
                        aria-label="Session code"
                        value={typed}
                        placeholder="BCDF-1234"
                        size={9}
                        maxLength={9}
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => {
                            setProblem(null);
                            setTyped(formatTyped(event.currentTarget.value));
                        }}
                    />
                </label>
                {message && (
                    <p className="alert" role="alert">
                        {message}
                    </p>
                )}
                <div className="join-actions">
                    <button type="submit" disabled={!cleanJoinCode(typed)}>
                        &gt; JOIN
                    </button>
                    <button type="button" onClick={() => remote.dismiss()}>
                        &gt; PLAY WITHOUT ONE
                    </button>
                </div>
            </form>
        </dialog>
    );
}
