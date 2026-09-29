import { describe, expect, it } from "vitest";
import type { ScreenRun } from "../../engine/runtime/screen-run.ts";
import { createTestTerminal } from "../../engine/runtime/test-helpers.ts";
import type { TeletronixFile } from "../../engine/schema/program.ts";

// teletype at 10ms a character
const FILE: TeletronixFile = {
    config: { name: "Test" },
    screens: {
        home: {
            content: [
                "page one",
                { type: "pause", text: "MORE" },
                "page two",
                { type: "pause" },
                "end",
            ],
        },
        nested: {
            content: [
                {
                    type: "section",
                    title: "S",
                    open: true,
                    content: ["in", { type: "pause" }, "after"],
                },
                "end",
            ],
        },
    },
};

const start = (screen = "home") => {
    const test = createTestTerminal(FILE);
    test.terminal.navigate(screen);
    return test;
};
const run = (terminal: ReturnType<typeof start>["terminal"]) =>
    terminal.getSnapshot().screen?.run as ScreenRun;

describe("pause", () => {
    it("stops the reveal after showing its text, until a key", () => {
        const { terminal, ticker } = start();
        ticker.advance(1000, 10);
        expect(run(terminal).states).toEqual(["done", "done", "ready", "ready", "ready"]);
        expect(run(terminal).pausedOn("home#1")).toBe(true);
        expect(run(terminal).finishedAt).toBeNull();

        // a modifier alone isn't a key press
        expect(terminal.pressKey("Shift")).toBe(false);
        expect(terminal.pressKey("x")).toBe(true);
        expect(run(terminal).pausedOn("home#1")).toBe(false);
        ticker.advance(1000, 10);
        expect(run(terminal).pausedOn("home#3")).toBe(true);
    });

    it("carries on at a tap", () => {
        const { terminal, ticker } = start();
        ticker.advance(1000, 10);
        expect(terminal.tap()).toBe(true);
        ticker.advance(1000, 10);
        expect(run(terminal).pausedOn("home#3")).toBe(true);
    });

    it("stops a skip too", () => {
        const { terminal } = start();
        terminal.skip();
        expect(run(terminal).pausedOn("home#1")).toBe(true);
        expect(run(terminal).states[2]).toBe("ready");
        terminal.pressKey("Enter");
        terminal.skip();
        expect(run(terminal).pausedOn("home#3")).toBe(true);
        terminal.pressKey("Enter");
        terminal.skip();
        expect(run(terminal).finishedAt).not.toBeNull();
    });

    it("inside an open section, holds the whole screen", () => {
        const { terminal, ticker } = start("nested");
        terminal.skip();
        const contents = run(terminal).section("nested#0") as ScreenRun;
        expect(contents.pausedOn("nested#0.1")).toBe(true);
        expect(run(terminal).paused).toBe(true);
        expect(run(terminal).states[1]).toBe("ready");

        terminal.pressKey(" ");
        ticker.advance(1000, 10);
        expect(contents.finishedAt).not.toBeNull();
        expect(run(terminal).states[1]).toBe("done");
        expect(run(terminal).finishedAt).not.toBeNull();
    });
});
