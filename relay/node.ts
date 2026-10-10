import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import type { Duplex } from "node:stream";
import { MAX_MESSAGE } from "../src/remote/relay-protocol.ts";
import { RelayCore } from "./core.ts";
import { acceptWebSocket } from "./websocket.ts";

// The relay on this computer, for other devices on its network: in Vite's dev and preview
// servers (see vite.config.ts) and the desktop app's (desktop/server.ts). The sessions are
// relay/core.ts's; this is how browsers reach them.
//
//   GET remote/socket       a WebSocket (see src/remote/relay-protocol.ts)
//   GET remote/addresses    where other devices can reach Teletronix, e.g.
//                           ["http://192.168.2.139:4173/"], for a QR code

const SOCKET = /\/remote\/socket$/;
const ADDRESSES = /\/remote\/addresses$/;
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

type Next = (error?: unknown) => void;

export interface Relay {
    /** A middleware for Connect (which Vite's servers use): the addresses. */
    (req: IncomingMessage, res: ServerResponse, next: Next): void;
    /** Takes an upgrade request that's the relay's (returning true), or leaves it (false). */
    upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
    /** Listens for the relay's upgrade requests on a server. */
    attach(server: Pick<Server, "on">): void;
}

/**
 * A relay. `exposed` says whether the server can be reached from other devices (Vite's
 * --host); if not, it has no addresses.
 */
export function createRelay({ exposed = () => true }: { exposed?: () => boolean } = {}): Relay {
    // (this computer's own windows aren't limited: only other devices' tries are counted)
    const core = new RelayCore({ unlimited: (address) => LOOPBACK.has(address) });
    const middleware = (req: IncomingMessage, res: ServerResponse, next: Next): void => {
        const url = new URL(req.url ?? "", "http://relay");
        if (ADDRESSES.test(url.pathname) && req.method === "GET") {
            const base = url.pathname.replace(ADDRESSES, "/");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(exposed() ? addresses(req.socket.localPort ?? 80, base) : []));
        } else if (SOCKET.test(url.pathname)) {
            // (only as a WebSocket)
            res.statusCode = 426;
            res.end();
        } else {
            next();
        }
    };
    const upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): boolean => {
        if (!SOCKET.test(new URL(req.url ?? "", "http://relay").pathname)) return false;
        acceptWebSocket(req, socket, head, MAX_MESSAGE, (ws) => {
            const handler = core.accept(ws, req.socket.remoteAddress ?? "");
            ws.onMessage = handler.receive;
            ws.onClose = handler.closed;
        });
        return true;
    };
    return Object.assign(middleware, {
        upgrade,
        attach: (server: Pick<Server, "on">) =>
            void server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) =>
                upgrade(req, socket, head),
            ),
    });
}

/**
 * The addresses this computer has on its networks (not itself), with the server's port and
 * path: where other devices can open Teletronix. Wired and Wi-Fi first.
 */
export function addresses(port: number, base: string): string[] {
    return Object.values(networkInterfaces())
        .flat()
        .filter((info) => info && info.family === "IPv4" && !info.internal)
        .map((info) => `http://${info?.address}:${port}${base}`);
}
