import { DurableObject } from "cloudflare:workers";
import { isJoinCode } from "../src/remote/codes.ts";
import { MAX_MESSAGE, type Refusal } from "../src/remote/relay-protocol.ts";
import { type Connection, type Handler, RelayCore, type SessionMemory } from "./core.ts";
import { type PackagesEnv, packages } from "./packages.ts";

// The relay on Cloudflare (see wrangler.toml), for sessions over the internet: the same
// sessions as the local relay's (relay/core.ts), one Durable Object each, named by its join
// code. Its WebSockets sleep while they're quiet (hibernation), so a session costs nothing
// between messages: what it needs kept is in its storage, and each connection carries the
// greeting it opened with, to take it back by when the session wakes.
//
//   GET /remote/socket?code=BCDF-1234   a WebSocket (see src/remote/relay-protocol.ts)
//   /packages…                          packages GMs with a key share (see packages.ts)

interface Env extends PackagesEnv {
    SESSIONS: DurableObjectNamespace<SessionRelay>;
    /** Tries at opening or joining, by address (see wrangler.toml) */
    TRIES: RateLimit;
    /** The pages allowed to use it, as their origins, separated by commas */
    ORIGINS: string;
}

/** What each connection carries through a session's sleep. */
interface Attachment {
    address: string;
    /** Its "open" or "join", once it's sent one */
    greeting?: string;
}

/** A WebSocket that refuses at once, saying why (as the relay itself would). */
function refusal(reason: Refusal): Response {
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    server.accept();
    server.send(JSON.stringify({ relay: "refused", reason }));
    server.close(1008, reason);
    return new Response(null, { status: 101, webSocket: client });
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const allowed = env.ORIGINS.split(",").map((each) => each.trim());
        const origin = request.headers.get("Origin");
        if (url.pathname === "/packages" || url.pathname.startsWith("/packages/")) {
            // (Teletronix's own pages may use them from a browser; no other site's may)
            if (origin !== null && !allowed.includes(origin)) {
                return new Response(null, { status: 403 });
            }
            const cors: HeadersInit = origin
                ? {
                      "Access-Control-Allow-Origin": origin,
                      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
                      "Access-Control-Allow-Headers": "Authorization, Content-Type",
                      "Access-Control-Max-Age": "86400",
                      Vary: "Origin",
                  }
                : {};
            if (request.method === "OPTIONS")
                return new Response(null, { status: 204, headers: cors });
            return packages(request, env, cors);
        }
        if (url.pathname !== "/remote/socket") {
            return new Response("Teletronix's relay: https://teletronix.net/\n", { status: 404 });
        }
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
            return new Response(null, { status: 426 });
        }
        // (from Teletronix's own pages; a browser always says where it's from)
        if (origin !== null && !allowed.includes(origin)) {
            return new Response(null, { status: 403 });
        }
        const code = url.searchParams.get("code") ?? "";
        if (!isJoinCode(code)) return refusal("invalid");
        const address = request.headers.get("CF-Connecting-IP") ?? "";
        if (!(await env.TRIES.limit({ key: address })).success) return refusal("too-many");
        const forwarded = new Request(request);
        forwarded.headers.set("X-Relay-Address", address);
        return env.SESSIONS.getByName(code).fetch(forwarded);
    },
};

/** A session: its connections, through the relay's sessions. */
export class SessionRelay extends DurableObject<Env> {
    private readonly core: RelayCore;
    private readonly handlers = new Map<WebSocket, Handler>();

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.core = new RelayCore({
            // (the Worker limits tries, across every session)
            unlimited: () => true,
            remember: (code, memory) => {
                if (memory) void ctx.storage.put("memory", { code, memory });
                else void ctx.storage.delete("memory");
            },
        });
        // the browser's keep-alive, answered without waking the session
        ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
        // waking: what it kept, then its connections, as they were
        void ctx.blockConcurrencyWhile(async () => {
            const kept = await ctx.storage.get<{ code: string; memory: SessionMemory }>("memory");
            if (kept) this.core.recall(kept.code, kept.memory);
            for (const socket of ctx.getWebSockets()) {
                const attachment = socket.deserializeAttachment() as Attachment | null;
                const handler = this.handlerFor(socket, attachment?.address ?? "");
                if (attachment?.greeting) handler.restore(attachment.greeting);
            }
        });
    }

    private handlerFor(socket: WebSocket, address: string): Handler {
        let handler = this.handlers.get(socket);
        if (!handler) {
            const connection: Connection = {
                send: (text) => {
                    try {
                        socket.send(text);
                    } catch {
                        // (already gone)
                    }
                },
                close: () => {
                    try {
                        socket.close(1000);
                    } catch {
                        // (already gone)
                    }
                },
            };
            handler = this.core.accept(connection, address);
            this.handlers.set(socket, handler);
        }
        return handler;
    }

    override async fetch(request: Request): Promise<Response> {
        const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
        const address = request.headers.get("X-Relay-Address") ?? "";
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({ address } satisfies Attachment);
        this.handlerFor(server, address);
        return new Response(null, { status: 101, webSocket: client });
    }

    override async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
        if (typeof message !== "string" || message.length > MAX_MESSAGE) {
            socket.close(1009, "Only JSON, up to 64 KB");
            return;
        }
        const attachment = (socket.deserializeAttachment() ?? { address: "" }) as Attachment;
        // its greeting, kept with it, to take it back by after a sleep
        if (!attachment.greeting && /^\{"relay":"(open|join)"/.test(message)) {
            socket.serializeAttachment({ ...attachment, greeting: message } satisfies Attachment);
        }
        this.handlerFor(socket, attachment.address).receive(message);
    }

    override async webSocketClose(socket: WebSocket, code: number, reason: string) {
        this.gone(socket);
        try {
            socket.close(code === 1005 ? 1000 : code, reason);
        } catch {
            // (already closed)
        }
    }

    override async webSocketError(socket: WebSocket) {
        this.gone(socket);
    }

    private gone(socket: WebSocket) {
        this.handlers.get(socket)?.closed();
        this.handlers.delete(socket);
    }
}
