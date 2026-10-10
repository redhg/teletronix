import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRelay } from "./node.ts";

// The relay on a Node server, over real WebSockets (Node's own client, as a browser's).

let server: Server;
let base: string;
const sockets: WebSocket[] = [];

beforeEach(async () => {
    const relay = createRelay();
    server = createServer((req, res) =>
        relay(req, res, () => {
            res.statusCode = 404;
            res.end();
        }),
    );
    relay.attach(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
});

/** A WebSocket to the relay, collecting what it's sent. */
async function connect() {
    const socket = new WebSocket(`ws://${base}/remote/socket`);
    sockets.push(socket);
    const received: unknown[] = [];
    socket.addEventListener("message", (event) => received.push(JSON.parse(String(event.data))));
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve);
        socket.addEventListener("error", reject);
    });
    const say = (message: object) => socket.send(JSON.stringify(message));
    const until = (check: (received: unknown[]) => boolean) =>
        expect.poll(() => check(received)).toBe(true);
    return { socket, received, say, until };
}

describe("the relay on a Node server", () => {
    it("passes messages between a GM and a player, both ways, over WebSockets", async () => {
        const gm = await connect();
        gm.say({ relay: "open", code: "BCDF-1234", secret: "a1b2c3d4e5f6g7h8i9j0k1l2m3" });
        await gm.until((r) => r.length === 2);
        const player = await connect();
        player.say({ relay: "join", code: "BCDF-1234", player: "p1" });
        await player.until((r) => r.length === 2);
        await gm.until((r) => JSON.stringify(r.at(-1)) === '{"relay":"players","players":["p1"]}');

        gm.say({ data: { type: "transmit", text: "HELLO" } });
        await player.until(
            (r) => JSON.stringify(r.at(-1)) === '{"data":{"type":"transmit","text":"HELLO"}}',
        );
        // (a long message comes in more than one frame's worth of length bytes)
        const long = "X".repeat(40_000);
        player.say({ data: long });
        await gm.until((r) => JSON.stringify(r.at(-1)) === JSON.stringify({ data: long }));

        // the GM's notice when the player goes
        player.socket.close();
        await gm.until((r) => JSON.stringify(r.at(-1)) === '{"relay":"players","players":[]}');
    });

    it("closes a connection that sends too much", async () => {
        const client = await connect();
        const closed = new Promise((resolve) => client.socket.addEventListener("close", resolve));
        client.say({ data: "X".repeat(70_000) });
        await closed;
    });

    it("isn't there except as a WebSocket, and says where other devices reach it", async () => {
        expect((await fetch(`http://${base}/remote/socket`)).status).toBe(426);
        const addresses = await (await fetch(`http://${base}/remote/addresses`)).json();
        expect(Array.isArray(addresses)).toBe(true);
        expect((await fetch(`http://${base}/elsewhere`)).status).toBe(404);
    });
});
