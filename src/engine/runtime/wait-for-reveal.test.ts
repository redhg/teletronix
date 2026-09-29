import { describe, expect, it } from "vitest";
import type { TeletronixFile } from "../schema/program.ts";
import type { ScreenRun } from "./screen-run.ts";
import { createTestTerminal } from "./test-helpers.ts";

// teletype at 10ms a character
const file = (waitForReveal?: boolean, screenWait?: boolean): TeletronixFile => ({
    config: { name: "Test", waitForReveal },
    screens: {
        home: {
            waitForReveal: screenWait,
            content: [
                { type: "link", text: "go", action: { screen: "home" } },
                "more text",
                {
                    type: "section",
                    title: "S",
                    content: [{ type: "link", text: "in", action: { screen: "home" } }, "tail"],
                },
            ],
        },
    },
});

const run = (terminal: ReturnType<typeof createTestTerminal>["terminal"]) =>
    terminal.getSnapshot().screen?.run as ScreenRun;

describe("waitForReveal", () => {
    it("is off by default: controls work as soon as they're revealed", () => {
        const { terminal, ticker } = createTestTerminal(file());
        terminal.start();
        ticker.advance(20, 10);
        expect(run(terminal).interactive).toBe(true);
    });

    it("keeps a screen's controls locked until it has finished revealing", () => {
        const { terminal, ticker } = createTestTerminal(file(true));
        terminal.start();
        ticker.advance(20, 10);
        expect(run(terminal).states[0]).toBe("done");
        expect(run(terminal).interactive).toBe(false);
        ticker.advance(1000, 10);
        expect(run(terminal).interactive).toBe(true);
    });

    it("unlocks at once when the reveal is skipped", () => {
        const { terminal, ticker } = createTestTerminal(file(true));
        terminal.start();
        ticker.advance(20, 10);
        terminal.skip();
        expect(run(terminal).interactive).toBe(true);
    });

    it("can be set by a screen, over the config", () => {
        const { terminal, ticker } = createTestTerminal(file(true, false));
        terminal.start();
        ticker.advance(20, 10);
        expect(run(terminal).interactive).toBe(true);
    });

    it("locks an opened section's contents until they've revealed", () => {
        const { terminal, ticker } = createTestTerminal(file(true));
        terminal.start();
        terminal.skip();
        terminal.remember("home#2", true);
        const contents = run(terminal).contents("home#2") as ScreenRun;
        ticker.advance(20, 10);
        expect(contents.interactive).toBe(false);
        expect(run(terminal).interactive).toBe(true);
        ticker.advance(1000, 10);
        expect(contents.interactive).toBe(true);
    });
});
