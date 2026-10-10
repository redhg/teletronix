import { describe, expect, it } from "vitest";
import { INTERNET_RELAY, isLocalHost, relayAddress } from "./relay-address.ts";

describe("which relay a page uses", () => {
    it("is its own, beside it, on this computer or its network", () => {
        for (const host of [
            "localhost",
            "127.0.0.1",
            "192.168.2.139",
            "10.0.0.5",
            "172.20.1.1",
            "[::1]",
            "tablet.local",
        ]) {
            expect(isLocalHost(host)).toBe(true);
        }
        expect(relayAddress("BCDF-1234", new URL("http://192.168.2.139:4173/?data=heist"))).toBe(
            "ws://192.168.2.139:4173/remote/socket?code=BCDF-1234",
        );
        expect(relayAddress("BCDF-1234", new URL("http://localhost:5173/sub/?data=x"))).toBe(
            "ws://localhost:5173/sub/remote/socket?code=BCDF-1234",
        );
    });

    it("is Teletronix's on the internet anywhere else", () => {
        for (const host of ["teletronix.net", "redhg.github.io", "172.32.0.1", "8.8.8.8"]) {
            expect(isLocalHost(host)).toBe(false);
        }
        const address = relayAddress("BCDF-1234", new URL("https://teletronix.net/?data=heist"));
        expect(address).toBe(`${INTERNET_RELAY}?code=BCDF-1234`);
        expect(address).toMatch(/^wss:\/\//);
    });
});
