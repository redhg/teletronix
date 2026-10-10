import { describe, expect, it } from "vitest";
import type { FromRelay } from "../src/remote/relay-protocol.ts";
import { RelayCore } from "./core.ts";

const CODE = "BCDF-1234";
const SECRET = "a1b2c3d4e5f6g7h8i9j0k1l2m3";

/** A browser on the relay: what it's been sent, and whether it's been closed. */
function browser(relay: RelayCore, address = "10.0.0.1") {
    const received: FromRelay[] = [];
    let closed = false;
    const handler = relay.accept(
        {
            send: (text) => received.push(JSON.parse(text) as FromRelay),
            close: () => {
                closed = true;
            },
        },
        address,
    );
    return {
        received,
        get closed() {
            return closed;
        },
        say: (message: object) => handler.receive(JSON.stringify(message)),
        leave: () => handler.closed(),
        /** What it's been sent as data, from the other side */
        data: () => received.flatMap((message) => ("data" in message ? [message.data] : [])),
        last: () => received.at(-1),
    };
}

const gm = (relay: RelayCore, secret = SECRET, code = CODE) => {
    const b = browser(relay);
    b.say({ relay: "open", code, secret });
    return b;
};
const player = (relay: RelayCore, id = "p1", code = CODE, address?: string) => {
    const b = browser(relay, address);
    b.say({ relay: "join", code, player: id });
    return b;
};

describe("the relay", () => {
    it("passes a GM's messages to every player, and a player's to the GM", () => {
        const relay = new RelayCore();
        const panel = gm(relay);
        expect(panel.received).toEqual([{ relay: "opened" }, { relay: "players", players: [] }]);
        const one = player(relay, "p1");
        const two = player(relay, "p2");
        expect(one.received).toEqual([{ relay: "joined" }, { relay: "gm", present: true }]);
        expect(panel.last()).toEqual({ relay: "players", players: ["p1", "p2"] });

        panel.say({ data: { type: "action", action: { screen: "bridge" } } });
        expect(one.data()).toEqual([{ type: "action", action: { screen: "bridge" } }]);
        expect(two.data()).toEqual([{ type: "action", action: { screen: "bridge" } }]);
        one.say({ data: { type: "state" } });
        expect(panel.data()).toEqual([{ type: "state" }]);
        // (players don't hear each other)
        expect(two.data()).toHaveLength(1);
    });

    it("keeps sessions apart", () => {
        const relay = new RelayCore();
        const panel = gm(relay);
        const elsewhere = player(relay, "p1", "ZZZZ-0000");
        panel.say({ data: "hello" });
        expect(elsewhere.data()).toEqual([]);
    });

    it("lets players wait for the GM, and tells them when it comes and goes", () => {
        const relay = new RelayCore();
        const early = player(relay);
        expect(early.last()).toEqual({ relay: "gm", present: false });
        const panel = gm(relay);
        expect(early.last()).toEqual({ relay: "gm", present: true });
        expect(panel.last()).toEqual({ relay: "players", players: ["p1"] });
        panel.leave();
        expect(early.last()).toEqual({ relay: "gm", present: false });
    });

    it("only lets a GM with the session's secret in, and takes commands only from GMs", () => {
        const relay = new RelayCore();
        gm(relay);
        const impostor = gm(relay, "zzzzzzzzzzzzzzzzzzzzzzzzzz");
        expect(impostor.received).toEqual([{ relay: "refused", reason: "taken" }]);
        expect(impostor.closed).toBe(true);
        // (the GM's own panel, again, in another window or after a reload)
        expect(gm(relay).received[0]).toEqual({ relay: "opened" });

        // a player's messages never reach other players, whatever it says
        const one = player(relay, "p1");
        const two = player(relay, "p2");
        one.say({ data: { type: "action", action: { screen: "airlock" } } });
        one.say({ relay: "remove", player: "p2" });
        expect(two.data()).toEqual([]);
        expect(two.closed).toBe(false);
    });

    it("lets the GM remove a player, who can't come back to that session", () => {
        const relay = new RelayCore();
        const panel = gm(relay);
        const stranger = player(relay, "p9");
        panel.say({ relay: "remove", player: "p9" });
        expect(stranger.last()).toEqual({ relay: "refused", reason: "removed" });
        expect(stranger.closed).toBe(true);
        expect(panel.last()).toEqual({ relay: "players", players: [] });
        expect(player(relay, "p9").last()).toEqual({ relay: "refused", reason: "removed" });
        expect(player(relay, "p8").last()).toEqual({ relay: "gm", present: true });
    });

    it("refuses what isn't a code or a secret", () => {
        const relay = new RelayCore();
        for (const code of ["BCDF1234", "ABCD-1234", "bcdf-1234", "BCDF-12345", 42]) {
            expect(player(relay, "p1", code as string).last()).toEqual({
                relay: "refused",
                reason: "invalid",
            });
        }
        expect(gm(relay, "short").last()).toEqual({ relay: "refused", reason: "invalid" });
        expect(relay.size).toBe(0);
    });

    it("limits each address's tries at joining", () => {
        let now = 0;
        const relay = new RelayCore({ tries: 3, per: 60_000, now: () => now });
        for (let i = 0; i < 3; i++) player(relay, `p${i}`, `BCDF-000${i}`, "6.6.6.6");
        const fourth = player(relay, "p4", "BCDF-0004", "6.6.6.6");
        expect(fourth.last()).toEqual({ relay: "refused", reason: "too-many" });
        // (others aren't held up; and after a while, it can try again)
        expect(player(relay, "p5", "BCDF-0005", "7.7.7.7").last()).toEqual({
            relay: "gm",
            present: false,
        });
        now = 61_000;
        expect(player(relay, "p6", "BCDF-0006", "6.6.6.6").last()).toEqual({
            relay: "gm",
            present: false,
        });
    });

    it("doesn't count tries from addresses it's told not to", () => {
        const relay = new RelayCore({ tries: 1, unlimited: (address) => address === "::1" });
        for (let i = 0; i < 5; i++) {
            expect(player(relay, `p${i}`, `BCDF-000${i}`, "::1").last()).toEqual({
                relay: "gm",
                present: false,
            });
        }
        player(relay, "q1", "BCDF-1111", "6.6.6.6");
        expect(player(relay, "q2", "BCDF-2222", "6.6.6.6").last()).toEqual({
            relay: "refused",
            reason: "too-many",
        });
    });

    it("forgets a session once everyone's gone, and ignores what it can't read", () => {
        const relay = new RelayCore();
        const panel = gm(relay);
        const one = player(relay);
        panel.say({ nonsense: true });
        one.say({ relay: "join", code: "ZZZZ-9999", player: "p1" });
        const garbled = browser(relay);
        garbled.leave();
        expect(relay.size).toBe(1);
        panel.leave();
        one.leave();
        expect(relay.size).toBe(0);
        // (and its GM can open it again, with its secret)
        expect(gm(relay).received[0]).toEqual({ relay: "opened" });
    });
});
