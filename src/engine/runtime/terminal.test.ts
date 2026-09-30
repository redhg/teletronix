import { describe, expect, it } from "vitest";
import type { Frame } from "../reveal/types.ts";
import { parseProgram, type TeletronixFile } from "../schema/program.ts";
import { ManualTicker } from "../time/ticker.ts";
import { Terminal } from "./terminal.ts";
import { createTestTerminal } from "./test-helpers.ts";

// Teletype at 10ms/char: "abc" takes 30ms, "de" takes 20ms.
const FILE: TeletronixFile = {
    config: { name: "Test", defaults: { teletype: { speed: 10 } } },
    screens: {
        home: {
            content: [
                "abc",
                "de",
                {
                    type: "link",
                    text: "go",
                    action: { screen: "other" },
                    secondaryAction: { dialog: "info" },
                },
            ],
        },
        other: {
            reveal: "instant",
            content: ["instant", { type: "text", text: "xy", reveal: "teletype" }],
        },
    },
    dialogs: { info: { type: "alert", content: ["Hi"] } },
};

function setup(overrides: { instant?: boolean; columns?: number } = {}) {
    const result = parseProgram(FILE);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const ticker = new ManualTicker();
    const terminal = new Terminal({ program: result.program, ticker, ...overrides });
    let snapshots = 0;
    terminal.subscribe(() => snapshots++);
    return { terminal, ticker, snapshots: () => snapshots };
}

const states = (terminal: Terminal) => terminal.getSnapshot().screen?.states;
const text = (frame: Frame) => frame.map((s) => s.text).join("|");

describe("Terminal", () => {
    it("starts on the start screen with the first element active", () => {
        const { terminal } = setup();
        terminal.start();
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("home");
        expect(states(terminal)).toEqual(["active", "ready", "ready"]);
    });

    it("activates elements one at a time, each when the previous finishes", () => {
        const { terminal, ticker } = setup();
        terminal.start();

        ticker.advance(29);
        expect(states(terminal)).toEqual(["active", "ready", "ready"]);
        ticker.advance(1);
        expect(states(terminal)).toEqual(["done", "active", "ready"]);
        ticker.advance(20);
        expect(states(terminal)).toEqual(["done", "done", "active"]);
        ticker.advance(20);
        expect(states(terminal)).toEqual(["done", "done", "done"]);
    });

    it("carries leftover time into the next element, whatever the frame rate", () => {
        const { terminal, ticker } = setup();
        terminal.start();
        // one 45ms frame: "abc" ends at 30, "de" has run 15ms of its 20
        ticker.advance(45);
        expect(states(terminal)).toEqual(["done", "active", "ready"]);
        const frames: string[] = [];
        terminal.getSnapshot().screen?.run.subscribeFrame(1, (f) => frames.push(text(f)));
        expect(frames).toEqual(["d|e|"]);
    });

    it("streams frames to subscribers without publishing snapshots", () => {
        const { terminal, ticker, snapshots } = setup();
        terminal.start();
        const run = terminal.getSnapshot().screen?.run;
        const frames: string[] = [];
        run?.subscribeFrame(0, (f) => frames.push(text(f)));

        const before = snapshots();
        ticker.advance(20, 5);
        expect(frames).toEqual(["|a|bc", "a|b|c", "ab|c|"]);
        expect(snapshots()).toBe(before);
    });

    it("stops listening to the ticker once the screen is done", () => {
        const { terminal, ticker } = setup();
        terminal.start();
        expect(ticker.active).toBe(true);
        ticker.advance(70);
        expect(ticker.active).toBe(false);
    });

    it("dispatches actions: navigation and dialogs", () => {
        const { terminal } = setup();
        terminal.start();
        terminal.dispatch([{ dialog: "info" }]);
        expect(terminal.getSnapshot().dialog?.content).toEqual(["Hi"]);
        terminal.answerDialog(true);
        expect(terminal.getSnapshot().dialog).toBeNull();

        terminal.dispatch([{ screen: "other" }]);
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("other");
    });

    it("replays a screen with a fresh run when navigating to it again", () => {
        const { terminal, ticker } = setup();
        terminal.start();
        ticker.advance(100);
        const first = terminal.getSnapshot().screen?.run;
        terminal.navigate("home");
        const second = terminal.getSnapshot().screen?.run;
        expect(second).not.toBe(first);
        expect(states(terminal)).toEqual(["active", "ready", "ready"]);
    });

    it("cascades reveals: element over screen over defaults", () => {
        const { terminal, ticker } = setup();
        terminal.navigate("other");
        // the first element uses the screen's "instant"; "xy" overrides it with teletype
        expect(states(terminal)).toEqual(["done", "active"]);
        ticker.advance(20);
        expect(states(terminal)).toEqual(["done", "done"]);
    });

    it("skips to the end of the screen", () => {
        const { terminal, ticker } = setup();
        terminal.start();
        terminal.skip();
        expect(states(terminal)).toEqual(["done", "done", "done"]);
        expect(ticker.active).toBe(false);
    });

    it("shows everything at once when instant", () => {
        const { terminal } = setup({ instant: true });
        terminal.start();
        expect(states(terminal)).toEqual(["done", "done", "done"]);
    });

    it("re-wraps frames when the column count changes", () => {
        const { terminal, ticker } = setup({ columns: 80 });
        terminal.navigate("other");
        ticker.advance(100);
        const frames: string[] = [];
        terminal.getSnapshot().screen?.run.subscribeFrame(0, (f) => frames.push(text(f)));
        terminal.setColumns(4);
        expect(frames).toEqual(["instant", "inst\nant"]);
    });
});

describe("the screen before", () => {
    it("is kept as text, for a crash to scramble", () => {
        const { terminal } = createTestTerminal({
            config: { name: "Test", reveal: "instant" },
            screens: { one: { content: ["FIRST", "LINES"] }, two: { content: ["SECOND"] } },
        });
        terminal.start();
        expect(terminal.previousText).toBe("");
        terminal.navigate("two");
        expect(terminal.previousText).toBe("FIRST\nLINES");
    });
});
