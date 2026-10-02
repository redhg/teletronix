import { channelName, isMessage } from "./protocol.ts";

/** A way for a GM's panel and players' terminals to reach each other. */
export interface Link {
    send(message: object): void;
    close(): void;
}

/**
 * How a link over the network is doing: connecting (or reconnecting after a drop),
 * connected, or unavailable (no relay where Teletronix is served, e.g. a hosted copy).
 */
export type LinkStatus = "connecting" | "connected" | "unavailable";

/** Windows of this browser: a BroadcastChannel named after the program. */
export function channelLink(program: string, receive: (message: { type: string }) => void): Link {
    const channel = new BroadcastChannel(channelName(program));
    channel.onmessage = (event: MessageEvent) => {
        if (isMessage(event.data)) receive(event.data);
    };
    return { send: (message) => channel.postMessage(message), close: () => channel.close() };
}

/** Letters and digits for pairing codes, without ones easy to mix up (0 and O, 1 and I). */
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;

/** A new pairing code, e.g. "K7QX". */
export const newCode = (): string =>
    Array.from(
        crypto.getRandomValues(new Uint32Array(CODE_LENGTH)),
        (n) => CODE_LETTERS[n % CODE_LETTERS.length],
    ).join("");

/** A pairing code as typed: capitals, without spaces or anything else. */
export const cleanCode = (typed: string): string =>
    typed
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 8);

/**
 * Other devices, through the server Teletronix is served from (see scripts/remote-relay.ts),
 * paired by a code. It reconnects by itself after a drop.
 */
export function relayLink(
    code: string,
    role: "gm" | "player",
    receive: (message: { type: string }) => void,
    status: (status: LinkStatus) => void = () => {},
): Link {
    const base = new URL(`remote/${code}/`, location.href);
    const events = new EventSource(new URL(`events?role=${role}`, base));
    status("connecting");
    events.onopen = () => status("connected");
    events.onerror = () => {
        // (closed for good when there's no relay to reach; otherwise it tries again)
        status(events.readyState === EventSource.CLOSED ? "unavailable" : "connecting");
    };
    events.onmessage = (event: MessageEvent<string>) => {
        try {
            const message: unknown = JSON.parse(event.data);
            if (isMessage(message)) receive(message);
        } catch {
            // not one of ours
        }
    };
    const to = new URL(`send?role=${role}`, base);
    return {
        send: (message) => {
            fetch(to, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(message),
            }).catch(() => {
                // lost; state is sent again soon anyway
            });
        },
        close: () => events.close(),
    };
}
