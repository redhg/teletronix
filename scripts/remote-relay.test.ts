import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRelay } from "./remote-relay.ts";

let server: Server;
let base: string;
const streams: AbortController[] = [];

beforeEach(async () => {
    const relay = createRelay();
    server = createServer((req, res) =>
        relay(req, res, () => {
            res.statusCode = 404;
            res.end();
        }),
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
    for (const stream of streams.splice(0)) stream.abort();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
});

/** Listens on a room's stream, collecting the messages that arrive. */
async function listen(room: string, role: string) {
    const abort = new AbortController();
    streams.push(abort);
    const response = await fetch(`${base}/remote/${room}/events?role=${role}`, {
        signal: abort.signal,
    });
    const received: unknown[] = [];
    const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
    void (async () => {
        let buffer = "";
        try {
            for (;;) {
                const { value, done } = (await reader?.read()) ?? { done: true };
                if (done) return;
                buffer += value;
                const events = buffer.split("\n\n");
                buffer = events.pop() ?? "";
                for (const event of events) {
                    const data = event.split("\n").find((line) => line.startsWith("data: "));
                    if (data) received.push(JSON.parse(data.slice(6)));
                }
            }
        } catch {
            // aborted
        }
    })();
    return { response, received };
}

const send = (room: string, role: string, body: string) =>
    fetch(`${base}/remote/${room}/send?role=${role}`, { method: "POST", body });

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("the remote relay", () => {
    it("passes a panel's messages to the room's terminals, and theirs back", async () => {
        const player = await listen("K7QX", "player");
        const gm = await listen("K7QX", "gm");
        const elsewhere = await listen("ZZZZ", "player");
        expect(player.response.headers.get("content-type")).toBe("text/event-stream");

        expect((await send("K7QX", "gm", '{"type":"hello"}')).status).toBe(204);
        expect((await send("K7QX", "player", '{"type":"state"}')).status).toBe(204);
        await settle();
        expect(player.received).toEqual([{ type: "hello" }]);
        expect(gm.received).toEqual([{ type: "state" }]);
        expect(elsewhere.received).toEqual([]);
    });

    it("refuses what isn't a message, and leaves other addresses alone", async () => {
        expect((await send("K7QX", "gm", "not json")).status).toBe(400);
        expect((await send("K7QX", "spy", "{}")).status).toBe(400);
        expect((await send("K7QX", "gm", `"${"x".repeat(70_000)}"`)).status).toBe(413);
        expect((await fetch(`${base}/remote/K7QX/send?role=gm`)).status).toBe(405);
        expect((await fetch(`${base}/remote/bad!/events?role=gm`)).status).toBe(404);
        expect((await fetch(`${base}/index.html`)).status).toBe(404);
    });
});
