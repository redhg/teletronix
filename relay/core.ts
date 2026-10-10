import { isJoinCode } from "../src/remote/codes.ts";
import type { FromRelay, Refusal, ToRelay } from "../src/remote/relay-protocol.ts";

// The relay's sessions, with nothing of where it runs: Node's server (relay/node.ts) for the
// local network, or a host on the internet. A session is its join code. Its GM's panel opens
// it with the session's secret (the first to open a code sets it; a panel with another secret
// can't); its players join with the code alone. A GM's messages go to every player; a
// player's, to the GMs. Only a GM can remove a player. Each address gets a limited number of
// tries at opening and joining.

/** A browser's connection, as the relay sees it. */
export interface Connection {
    send(text: string): void;
    close(): void;
}

/** What the relay does with a connection: what it says, and when it's gone. */
export interface Handler {
    receive(text: string): void;
    closed(): void;
    /**
     * Takes a connection back, by the greeting it opened with (its "open" or "join"), as it
     * was before: without telling anyone, nor counting it as a try. For a host that forgets
     * its sessions while they're quiet (see `remember`), and keeps their connections.
     */
    restore(greeting: string): void;
}

/** What a session needs kept, besides its connections: its GM's secret, and who's removed. */
export interface SessionMemory {
    secret?: string;
    removed: string[];
}

interface Client {
    connection: Connection;
    /** Its session, once it's opened or joined one */
    session?: Session;
    /** A players' window's id */
    player?: string;
    gm: boolean;
}

interface Session {
    code: string;
    /** Set by the first GM to open it */
    secret?: string;
    gms: Set<Client>;
    players: Set<Client>;
    /** Players' windows the GM took out */
    removed: Set<string>;
}

export interface RelayOptions {
    /** Tries at opening or joining an address gets, every `per` milliseconds (default 30 a minute) */
    tries?: number;
    per?: number;
    /**
     * Addresses whose tries aren't counted: e.g. the computer the relay runs on, whose own
     * windows (and tests) can't be strangers guessing codes
     */
    unlimited?: (address: string) => boolean;
    /**
     * Called when what a session needs kept changes (null once it's over), for a host that
     * forgets its sessions while they're quiet, to give back with `recall`
     */
    remember?: (code: string, memory: SessionMemory | null) => void;
    /** The time (ms), for tests */
    now?: () => number;
}

/** A relay: give it each connection as it comes, with the address it's from. */
export class RelayCore {
    private readonly sessions = new Map<string, Session>();
    private readonly attempts = new Map<string, number[]>();
    private readonly tries: number;
    private readonly per: number;
    private readonly now: () => number;
    private readonly unlimited: (address: string) => boolean;
    private readonly remember: (code: string, memory: SessionMemory | null) => void;
    /** Restoring connections: nothing's said, and no tries are counted */
    private quiet = false;

    constructor({
        tries = 30,
        per = 60_000,
        unlimited = () => false,
        remember = () => {},
        now = Date.now,
    }: RelayOptions = {}) {
        this.tries = tries;
        this.per = per;
        this.unlimited = unlimited;
        this.remember = remember;
        this.now = now;
    }

    /** Gives back what a session needs kept (see `remember`), before restoring its connections. */
    recall(code: string, memory: SessionMemory): void {
        const session = this.session(code);
        session.secret = memory.secret;
        session.removed = new Set(memory.removed);
    }

    private memorize(session: Session) {
        if (this.quiet) return;
        this.remember(session.code, {
            ...(session.secret === undefined ? {} : { secret: session.secret }),
            removed: [...session.removed],
        });
    }

    /** How many sessions are open (for tests, and a host's own checks). */
    get size(): number {
        return this.sessions.size;
    }

    accept(connection: Connection, address: string): Handler {
        const client: Client = { connection, gm: false };
        return {
            receive: (text) => this.receive(client, address, text),
            closed: () => this.leave(client),
            restore: (greeting) => {
                this.quiet = true;
                try {
                    this.receive(client, address, greeting);
                } finally {
                    this.quiet = false;
                }
            },
        };
    }

    private send(client: Client, message: FromRelay) {
        if (!this.quiet) client.connection.send(JSON.stringify(message));
    }

    private refuse(client: Client, reason: Refusal) {
        this.send(client, { relay: "refused", reason });
        this.leave(client);
        client.connection.close();
    }

    /** Whether an address may try again (and counts this try). */
    private allowed(address: string): boolean {
        if (this.quiet || this.unlimited(address)) return true;
        const now = this.now();
        const recent = (this.attempts.get(address) ?? []).filter((at) => now - at < this.per);
        recent.push(now);
        this.attempts.set(address, recent);
        // (forgetting addresses that have gone quiet)
        if (this.attempts.size > 10_000) {
            for (const [key, times] of this.attempts) {
                if (times.every((at) => now - at >= this.per)) this.attempts.delete(key);
            }
        }
        return recent.length <= this.tries;
    }

    private receive(client: Client, address: string, text: string) {
        let message: ToRelay;
        try {
            message = JSON.parse(text) as ToRelay;
        } catch {
            return;
        }
        if (typeof message !== "object" || message === null) return;
        if ("data" in message) {
            this.forward(client, message.data);
            return;
        }
        switch (message.relay) {
            case "open":
                if (client.session) return;
                if (!this.allowed(address)) return this.refuse(client, "too-many");
                if (!isJoinCode(String(message.code)) || !validSecret(message.secret)) {
                    return this.refuse(client, "invalid");
                }
                return this.open(client, message.code, message.secret);
            case "join":
                if (client.session) return;
                if (!this.allowed(address)) return this.refuse(client, "too-many");
                if (!isJoinCode(String(message.code)) || !validId(message.player)) {
                    return this.refuse(client, "invalid");
                }
                return this.join(client, message.code, message.player);
            case "remove":
                if (client.gm && client.session) this.remove(client.session, message.player);
                return;
        }
    }

    private session(code: string): Session {
        let session = this.sessions.get(code);
        if (!session) {
            session = { code, gms: new Set(), players: new Set(), removed: new Set() };
            this.sessions.set(code, session);
        }
        return session;
    }

    private open(client: Client, code: string, secret: string) {
        const session = this.session(code);
        if (session.secret !== undefined && session.secret !== secret) {
            return this.refuse(client, "taken");
        }
        const isNew = session.secret === undefined;
        session.secret = secret;
        if (isNew) this.memorize(session);
        client.session = session;
        client.gm = true;
        const first = session.gms.size === 0;
        session.gms.add(client);
        this.send(client, { relay: "opened" });
        this.send(client, { relay: "players", players: playersOf(session) });
        if (first) this.tellPlayers(session, { relay: "gm", present: true });
    }

    private join(client: Client, code: string, player: string) {
        const session = this.session(code);
        if (session.removed.has(player)) return this.refuse(client, "removed");
        client.session = session;
        client.player = player;
        session.players.add(client);
        this.send(client, { relay: "joined" });
        this.send(client, { relay: "gm", present: session.gms.size > 0 });
        this.tellGms(session);
    }

    private remove(session: Session, player: unknown) {
        if (!validId(player)) return;
        session.removed.add(player);
        this.memorize(session);
        for (const client of [...session.players]) {
            if (client.player === player) this.refuse(client, "removed");
        }
    }

    private forward(client: Client, data: unknown) {
        const session = client.session;
        if (!session) return;
        const text = JSON.stringify({ data } satisfies FromRelay);
        const to = client.gm ? session.players : session.gms;
        for (const other of to) other.connection.send(text);
    }

    private tellPlayers(session: Session, message: FromRelay) {
        for (const player of session.players) this.send(player, message);
    }

    private tellGms(session: Session) {
        const message: FromRelay = { relay: "players", players: playersOf(session) };
        for (const gm of session.gms) this.send(gm, message);
    }

    private leave(client: Client) {
        const session = client.session;
        if (!session) return;
        client.session = undefined;
        if (client.gm) {
            session.gms.delete(client);
            if (session.gms.size === 0) this.tellPlayers(session, { relay: "gm", present: false });
        } else {
            session.players.delete(client);
            this.tellGms(session);
        }
        // (an empty session goes; its GM opens it again with its secret)
        if (session.gms.size === 0 && session.players.size === 0) {
            this.sessions.delete(session.code);
            if (!this.quiet) this.remember(session.code, null);
        }
    }
}

/** The players' windows in a session, each once. */
const playersOf = (session: Session) =>
    [...new Set([...session.players].map((client) => client.player as string))].sort();

const validSecret = (secret: unknown): secret is string =>
    typeof secret === "string" && /^[a-z0-9]{20,64}$/.test(secret);

const validId = (id: unknown): id is string =>
    typeof id === "string" && /^[a-z0-9-]{1,64}$/.test(id);
