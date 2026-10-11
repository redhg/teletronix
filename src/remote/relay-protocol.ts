// Between a browser (a GM's panel, or a players' terminal) and the relay that passes their
// messages on (relay/core.ts), as JSON over a WebSocket. A GM opens a session with its join
// code and its secret; players join it with the code. What either sends as `data` goes to the
// other side: a GM's to every player, a player's to the GMs. Only a GM can remove a player.

/** From a browser to the relay. */
export type ToRelay =
    /** A GM's panel opens its session (or opens it again, after a reload or a drop). */
    | { relay: "open"; code: string; secret: string }
    /** A players' terminal joins a session, as one of its windows. */
    | { relay: "join"; code: string; player: string }
    /** The GM takes a players' window out of the session. */
    | { relay: "remove"; player: string }
    /** A message for the other side: from a GM, to every player, or one (`to`). */
    | { data: unknown; to?: string };

/** Why the relay wouldn't have a browser in a session. */
export type Refusal =
    /** Another GM has that code (another secret). */
    | "taken"
    /** It isn't a code, or isn't a secret. */
    | "invalid"
    /** Too many tries from this address in a while (or messages, from this connection). */
    | "too-many"
    /** The GM took this window out. */
    | "removed";

/** From the relay to a browser. */
export type FromRelay =
    /** The GM's session is open. */
    | { relay: "opened" }
    /** The players' terminal is in the session (whether or not the GM is there yet). */
    | { relay: "joined" }
    /** To players: whether the GM's panel is connected. */
    | { relay: "gm"; present: boolean }
    /** To a GM: the players' windows in the session. */
    | { relay: "players"; players: string[] }
    /** It won't, and why; the connection closes. */
    | { relay: "refused"; reason: Refusal }
    /** A message from the other side. */
    | { data: unknown };

/** The largest message, in bytes. */
export const MAX_MESSAGE = 64 * 1024;
