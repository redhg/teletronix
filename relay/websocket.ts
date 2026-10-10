import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

// WebSockets, the server's side, as far as the relay needs them (RFC 6455): the handshake,
// text messages (in one frame or several), ping and pong, and closing. No library: the
// desktop app runs this as it is, without node_modules.

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const TEXT = 0x1;
const BINARY = 0x2;
const CONTINUATION = 0x0;
const CLOSE = 0x8;
const PING = 0x9;
const PONG = 0xa;
/** How often a quiet connection is pinged, and how long it has to answer. */
const PING_MS = 25_000;

export interface Socket {
    send(text: string): void;
    close(): void;
    onMessage: (text: string) => void;
    onClose: () => void;
}

/** A frame, to send: unmasked, as a server sends them. */
function frame(opcode: number, payload: Buffer): Buffer {
    const length = payload.length;
    const header =
        length < 126
            ? Buffer.from([0x80 | opcode, length])
            : length < 0x10000
              ? Buffer.from([0x80 | opcode, 126, length >> 8, length & 0xff])
              : Buffer.concat([Buffer.from([0x80 | opcode, 127]), u64(length)]);
    return Buffer.concat([header, payload]);
}

const u64 = (n: number) => {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(n));
    return buffer;
};

/**
 * Takes an HTTP upgrade request as a WebSocket, and calls `opened` with it; or refuses it
 * (closing the socket) if it isn't a WebSocket handshake. Messages longer than `max` bytes
 * close the connection.
 */
export function acceptWebSocket(
    req: IncomingMessage,
    socket: Duplex,
    /** What came after the request, already read (the upgrade event's `head`) */
    head: Buffer,
    max: number,
    opened: (socket: Socket) => void,
): void {
    const key = req.headers["sec-websocket-key"];
    if (req.headers.upgrade?.toLowerCase() !== "websocket" || typeof key !== "string") {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
        return;
    }
    const accept = createHash("sha1")
        .update(key + GUID)
        .digest("base64");
    socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );

    let buffered: Buffer = Buffer.alloc(0);
    /** A message arriving in several frames, so far */
    let parts: Buffer[] = [];
    let partsLength = 0;
    let closed = false;
    let answered = true;

    const ws: Socket = {
        send: (text) => {
            if (!closed) socket.write(frame(TEXT, Buffer.from(text, "utf8")));
        },
        close: () => finish(true),
        onMessage: () => {},
        onClose: () => {},
    };

    const finish = (sayGoodbye: boolean) => {
        if (closed) return;
        closed = true;
        clearInterval(pinger);
        if (sayGoodbye) socket.end(frame(CLOSE, Buffer.from([0x03, 0xe8])));
        else socket.destroy();
        ws.onClose();
    };

    // (a connection that stops answering is gone, even if nothing said so)
    const pinger = setInterval(() => {
        if (!answered) return finish(false);
        answered = false;
        socket.write(frame(PING, Buffer.alloc(0)));
    }, PING_MS);

    const handle = (opcode: number, fin: boolean, payload: Buffer) => {
        answered = true;
        switch (opcode) {
            case TEXT:
            case CONTINUATION:
                parts.push(payload);
                partsLength += payload.length;
                if (partsLength > max) return finish(true);
                if (fin) {
                    const text = Buffer.concat(parts).toString("utf8");
                    parts = [];
                    partsLength = 0;
                    ws.onMessage(text);
                }
                return;
            case BINARY:
                // (not the relay's: it only speaks JSON)
                return finish(true);
            case PING:
                socket.write(frame(PONG, payload));
                return;
            case PONG:
                return;
            case CLOSE:
                return finish(true);
        }
    };

    const take = (chunk: Buffer) => {
        buffered = buffered.length ? Buffer.concat([buffered, chunk]) : chunk;
        while (!closed && buffered.length >= 2) {
            const first = buffered[0] as number;
            const second = buffered[1] as number;
            let length = second & 0x7f;
            let at = 2;
            if (length === 126) {
                if (buffered.length < 4) return;
                length = buffered.readUInt16BE(2);
                at = 4;
            } else if (length === 127) {
                if (buffered.length < 10) return;
                const big = buffered.readBigUInt64BE(2);
                if (big > BigInt(max)) return finish(true);
                length = Number(big);
                at = 10;
            }
            if (length > max) return finish(true);
            // (a browser masks every frame it sends)
            if (!(second & 0x80)) return finish(true);
            if (buffered.length < at + 4 + length) return;
            const mask = buffered.subarray(at, at + 4);
            const payload = Buffer.from(buffered.subarray(at + 4, at + 4 + length));
            for (let i = 0; i < payload.length; i++) {
                payload[i] = (payload[i] as number) ^ (mask[i % 4] as number);
            }
            buffered = buffered.subarray(at + 4 + length);
            handle(first & 0x0f, (first & 0x80) !== 0, payload);
        }
    };
    socket.on("data", take);
    socket.on("close", () => finish(false));
    socket.on("error", () => finish(false));
    opened(ws);
    if (head.length) take(head);
}
