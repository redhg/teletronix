import { channelName, isMessage } from "./protocol.ts";
import { relayAddress } from "./relay-address.ts";
import type { FromRelay, Refusal, ToRelay } from "./relay-protocol.ts";

/** A way for a GM's panel and players' terminals to reach each other. */
export interface Link {
    send(message: object): void;
    close(): void;
}

/**
 * How a link over the network is doing: connecting (or reconnecting after a drop),
 * connected, unavailable (no relay where Teletronix is served, e.g. a hosted copy), or
 * refused (the relay wouldn't have it in the session: see SessionEvents).
 */
export type LinkStatus = "connecting" | "connected" | "unavailable" | "refused";

/** Windows of this browser: a BroadcastChannel named after the program. */
export function channelLink(program: string, receive: (message: { type: string }) => void): Link {
    const channel = new BroadcastChannel(channelName(program));
    channel.onmessage = (event: MessageEvent) => {
        if (isMessage(event.data)) receive(event.data);
    };
    return { send: (message) => channel.postMessage(message), close: () => channel.close() };
}

export { randomId } from "./codes.ts";

/** Who's on the end of a session's link: its GM's panel, or one of its players' windows. */
export type SessionRole =
    | { gm: { code: string; secret: string } }
    | { player: { code: string; id: string } };

/** What the relay says about a session, besides its messages. */
export interface SessionEvents {
    /** To a player: whether the GM's panel is connected */
    gm?(present: boolean): void;
    /** To a GM: the players' windows in the session */
    players?(ids: string[]): void;
    /** It won't have this browser in the session, and why (it doesn't try again) */
    refused?(reason: Refusal): void;
}

/** How long to wait before trying again after a drop: longer each time, up to this. */
const RETRY_MS = [1000, 2000, 4000, 8000];
/** How often a quiet connection says it's still there (so nothing between closes it). */
const KEEP_ALIVE_MS = 30_000;

/**
 * A session, through a relay (see relay-address.ts): opened by its GM, or joined by a
 * player. It reconnects by itself after a drop; if the relay was never there, it's
 * unavailable, and stops.
 */
export function sessionLink(
    role: SessionRole,
    receive: (message: { type: string }) => void,
    status: (status: LinkStatus) => void = () => {},
    events: SessionEvents = {},
): Link & { remove(player: string): void } {
    let socket: WebSocket | null = null;
    let ready = false;
    let stopped = false;
    let everOpened = false;
    let failures = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    const code = "gm" in role ? role.gm.code : role.player.code;

    const hello: ToRelay =
        "gm" in role
            ? { relay: "open", code: role.gm.code, secret: role.gm.secret }
            : { relay: "join", code: role.player.code, player: role.player.id };

    const connect = () => {
        status("connecting");
        const ws = new WebSocket(relayAddress(code));
        socket = ws;
        ws.onopen = () => {
            everOpened = true;
            failures = 0;
            ws.send(JSON.stringify(hello));
            // (answered by the relay without anything else waking: see relay/cloudflare.ts)
            clearInterval(keepAlive);
            keepAlive = setInterval(() => ws.send("ping"), KEEP_ALIVE_MS);
        };
        ws.onmessage = (event: MessageEvent<string>) => {
            if (event.data === "pong") return;
            let message: FromRelay;
            try {
                message = JSON.parse(event.data) as FromRelay;
            } catch {
                return;
            }
            if ("data" in message) {
                if (isMessage(message.data)) receive(message.data);
                return;
            }
            switch (message.relay) {
                case "opened":
                case "joined":
                    ready = true;
                    status("connected");
                    return;
                case "gm":
                    events.gm?.(message.present);
                    return;
                case "players":
                    events.players?.(message.players);
                    return;
                case "refused":
                    stopped = true;
                    status("refused");
                    events.refused?.(message.reason);
                    return;
            }
        };
        ws.onclose = () => {
            ready = false;
            clearInterval(keepAlive);
            if (stopped || socket !== ws) return;
            // (never reached: no relay where Teletronix is served)
            if (!everOpened) {
                stopped = true;
                status("unavailable");
                return;
            }
            status("connecting");
            retry = setTimeout(connect, RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)]);
        };
    };
    connect();

    const say = (message: ToRelay) => {
        if (ready && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };
    return {
        // (lost while connecting; state is sent again soon anyway)
        send: (message) => say({ data: message }),
        remove: (player) => say({ relay: "remove", player }),
        close: () => {
            stopped = true;
            clearTimeout(retry);
            clearInterval(keepAlive);
            socket?.close();
        },
    };
}
