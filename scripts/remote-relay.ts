import type { IncomingMessage, ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";

// Passes messages between a GM's panel and players' terminals on other devices, for the
// Vite dev and preview servers (see vite.config.ts). Each pairing code is a room: what a
// panel sends goes to the room's terminals, and what a terminal sends goes to its panels.
//
//   GET  remote/<code>/events?role=gm|player   a stream of messages (server-sent events)
//   POST remote/<code>/send?role=gm|player     a message (JSON) for the other side
//   GET  remote/addresses                      where other devices can reach Teletronix, e.g.
//                                              ["http://192.168.2.139:4173/"], for a QR code

const PATH = /\/remote\/([A-Z0-9]{4,8})\/(events|send)$/;
const ADDRESSES = /\/remote\/addresses$/;
/** The largest message accepted. */
const MAX_BYTES = 64 * 1024;
/** How often an idle stream gets a comment, so nothing between closes it. */
const KEEP_ALIVE_MS = 15_000;

type Role = "gm" | "player";
type Next = (error?: unknown) => void;

/**
 * A relay: a middleware for Connect (which Vite's servers use). `exposed` says whether the
 * server can be reached from other devices (Vite's --host); if not, it has no addresses.
 */
export function createRelay({ exposed = () => true }: { exposed?: () => boolean } = {}) {
    const rooms = new Map<string, Set<{ role: Role; res: ServerResponse }>>();

    const listen = (room: string, role: Role, req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        });
        // (reconnect quickly after a drop)
        res.write("retry: 2000\n\n");
        const client = { role, res };
        const clients = rooms.get(room) ?? new Set();
        clients.add(client);
        rooms.set(room, clients);
        const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), KEEP_ALIVE_MS);
        req.on("close", () => {
            clearInterval(keepAlive);
            clients.delete(client);
            if (clients.size === 0) rooms.delete(room);
        });
    };

    const forward = (room: string, from: Role, req: IncomingMessage, res: ServerResponse) => {
        let body = "";
        let tooBig = false;
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => {
            body += chunk;
            if (body.length > MAX_BYTES) tooBig = true;
        });
        req.on("end", () => {
            const message = tooBig ? undefined : parseJson(body);
            if (message === undefined) {
                finish(res, tooBig ? 413 : 400);
                return;
            }
            const data = `data: ${JSON.stringify(message)}\n\n`;
            for (const client of rooms.get(room) ?? []) {
                if (client.role !== from) client.res.write(data);
            }
            finish(res, 204);
        });
    };

    return (req: IncomingMessage, res: ServerResponse, next: Next): void => {
        const url = new URL(req.url ?? "", "http://relay");
        const match = PATH.exec(url.pathname);
        const role = url.searchParams.get("role");
        if (ADDRESSES.test(url.pathname) && req.method === "GET") {
            const base = url.pathname.replace(ADDRESSES, "/");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(exposed() ? addresses(req.socket.localPort ?? 80, base) : []));
        } else if (!match) {
            next();
        } else if (role !== "gm" && role !== "player") {
            finish(res, 400);
        } else if (match[2] === "events" && req.method === "GET") {
            listen(match[1] ?? "", role, req, res);
        } else if (match[2] === "send" && req.method === "POST") {
            forward(match[1] ?? "", role, req, res);
        } else {
            finish(res, 405);
        }
    };
}

function finish(res: ServerResponse, status: number): void {
    res.statusCode = status;
    res.end();
}

/** JSON's value, or undefined if it isn't JSON. */
function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
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
