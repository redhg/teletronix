import { describe, expect, it } from "vitest";
import type { TeletronixFile } from "../schema/program.ts";
import type { ScreenRun } from "./screen-run.ts";
import { createTestTerminal } from "./test-helpers.ts";

// teletype at 10ms a character
const file = (skipKeys?: string[]): TeletronixFile => ({
    config: { name: "Test", skipKeys },
    screens: {
        home: { content: ["a long line of text that takes a while to type"] },
        question: {
            next: { key: "Escape", action: { screen: "home" } },
            content: ["leave?"],
        },
    },
});

const run = (terminal: ReturnType<typeof createTestTerminal>["terminal"]) =>
    terminal.getSnapshot().screen?.run as ScreenRun;

describe("skip keys", () => {
    it("finish the reveal with Esc by default", () => {
        const { terminal, ticker } = createTestTerminal(file());
        terminal.start();
        ticker.advance(50, 10);
        expect(terminal.revealing).toBe(true);
        expect(terminal.pressKey("Escape")).toBe(true);
        expect(run(terminal).finishedAt).not.toBeNull();
        expect(terminal.revealing).toBe(false);
        // with nothing left to reveal, Esc isn't used
        expect(terminal.pressKey("Escape")).toBe(false);
    });

    it("can be other keys, or none", () => {
        const space = createTestTerminal(file(["Space"]));
        space.terminal.start();
        expect(space.terminal.pressKey("Escape")).toBe(false);
        expect(space.terminal.pressKey(" ")).toBe(true);
        expect(run(space.terminal).finishedAt).not.toBeNull();

        const none = createTestTerminal(file([]));
        none.terminal.start();
        expect(none.terminal.pressKey("Escape")).toBe(false);
        expect(run(none.terminal).finishedAt).toBeNull();
    });

    it("come after the program's own use of a key", () => {
        const { terminal, ticker } = createTestTerminal(file());
        terminal.navigate("question");
        // the screen's rule wants Esc: the first press finishes the reveal, the next acts
        terminal.pressKey("Escape");
        ticker.advance(10, 10);
        terminal.pressKey("Escape");
        expect(run(terminal).screen.id).toBe("home");
    });
});
