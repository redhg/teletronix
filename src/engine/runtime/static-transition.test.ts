import { describe, expect, it } from "vitest";
import { createTestTerminal } from "./test-helpers.ts";

const FILE = {
    config: { name: "Test", defaults: { teletype: { speed: 10 } } },
    screens: {
        plain: { content: ["abc"] },
        tuned: { transition: "static" as const, content: ["new"] },
        long: { transition: { type: "static" as const, duration: 300 }, content: ["x"] },
    },
};

describe("static transition", () => {
    it("drops the old screen and holds the new one until the static has passed", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.navigate("plain");
        terminal.navigate("tuned");

        const snapshot = terminal.getSnapshot();
        expect(snapshot.outgoing).toBeNull();
        expect(snapshot.interstitial).toEqual({ type: "static" });
        expect(snapshot.screen?.run.screen.id).toBe("tuned");
        expect(snapshot.screen?.states).toEqual(["ready"]);

        ticker.advance(119);
        expect(terminal.getSnapshot().screen?.states).toEqual(["ready"]);
        ticker.advance(1);
        expect(terminal.getSnapshot().interstitial).toBeNull();
        expect(terminal.getSnapshot().screen?.states).toEqual(["active"]);
        // "new" types from the moment the static ended: 30ms later, it's done
        ticker.advance(30);
        expect(terminal.getSnapshot().screen?.states).toEqual(["done"]);
    });

    it("takes its duration from the screen", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.navigate("plain");
        terminal.navigate("long");
        ticker.advance(299);
        expect(terminal.getSnapshot().interstitial).not.toBeNull();
        ticker.advance(1);
        expect(terminal.getSnapshot().interstitial).toBeNull();
    });

    it("ends when skipped, finishing the new screen too", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.navigate("plain");
        terminal.navigate("tuned");
        terminal.skip();
        expect(terminal.getSnapshot().interstitial).toBeNull();
        expect(terminal.getSnapshot().screen?.states).toEqual(["done"]);
    });

    it("isn't shown for the first screen, or when everything is instant", () => {
        const first = createTestTerminal(FILE).terminal;
        first.navigate("tuned");
        expect(first.getSnapshot().interstitial).toBeNull();

        const instant = createTestTerminal(FILE, { instant: true }).terminal;
        instant.navigate("plain");
        instant.navigate("tuned");
        expect(instant.getSnapshot().interstitial).toBeNull();
    });

    it("is replaced by the next navigation", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.navigate("plain");
        terminal.navigate("tuned");
        terminal.navigate("plain");
        expect(terminal.getSnapshot().interstitial).toBeNull();
        expect(terminal.getSnapshot().screen?.states).toEqual(["active"]);
    });
});
