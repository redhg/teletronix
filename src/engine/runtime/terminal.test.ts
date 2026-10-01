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

describe("the restart action", () => {
    it("starts over: the start screen, variables and memory as they began", () => {
        const { terminal } = createTestTerminal({
            config: { name: "Test", reveal: "instant", variables: { score: 0 } },
            screens: { one: { content: ["ONE"] }, two: { content: ["TWO"] } },
        });
        terminal.start();
        terminal.dispatch([{ set: [{ variable: "score", add: 5 }], screen: "two" }]);
        terminal.remember("one#0", "remembered");
        expect(terminal.variable("score")).toBe(5);
        terminal.dispatch([{ restart: true }]);
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("one");
        expect(terminal.variable("score")).toBe(0);
        expect(terminal.recall("one#0")).toBeUndefined();
    });

    it("can't also go somewhere", () => {
        const result = parseProgram({
            config: { name: "Test" },
            screens: {
                one: {
                    content: [
                        { type: "link", text: "x", action: { restart: true, screen: "one" } },
                    ],
                },
            },
        });
        expect(result.ok).toBe(false);
    });
});

describe("saving progress", () => {
    const file = {
        config: {
            name: "Test",
            reveal: "instant" as const,
            variables: { score: 0, name: "X" },
            timers: { clock: { from: 60 } },
        },
        screens: {
            one: { content: [{ type: "section" as const, title: "S", content: ["x"] }] },
            two: { content: ["TWO"] },
        },
    };

    it("carries on from where it was saved", () => {
        const first = createTestTerminal(file);
        first.terminal.start();
        first.terminal.dispatch([
            { set: [{ variable: "score", value: 7 }], startTimer: "clock", screen: "two" },
        ]);
        first.terminal.remember("one#0", true);
        first.ticker.advance(5000, 1000);
        const saved = JSON.parse(JSON.stringify(first.terminal.saveState()));

        const second = createTestTerminal(file);
        second.terminal.restoreState(saved);
        second.terminal.start();
        expect(second.terminal.getSnapshot().screen?.run.screen.id).toBe("two");
        expect(second.terminal.variable("score")).toBe(7);
        expect(second.terminal.recall("one#0")).toBe(true);
        // the timer carries on from where it was, still running
        expect(second.terminal.variable("clock")).toBe(55);
        second.ticker.advance(2000, 1000);
        expect(second.terminal.variable("clock")).toBe(53);
    });

    it("ignores what the program no longer has, and saves that aren't saves", () => {
        const { terminal } = createTestTerminal(file);
        terminal.restoreState({
            version: 1,
            screen: "gone",
            variables: { score: "not a number", missing: 1, name: "Y" },
            memory: { "gone#0": true },
            timers: {},
        });
        terminal.restoreState("nonsense");
        terminal.start();
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("one");
        expect(terminal.variable("score")).toBe(0);
        expect(terminal.variable("name")).toBe("Y");
        expect(terminal.recall("gone#0")).toBeUndefined();
    });
});

describe("going back", () => {
    const file = {
        config: { name: "Test", reveal: "instant" as const },
        screens: {
            one: { content: ["ONE"] },
            two: { content: ["TWO"] },
            help: { content: ["HELP"] },
        },
    };
    const at = (terminal: Terminal) => terminal.getSnapshot().screen?.run.screen.id;

    it("returns through the screens before, most recent first", () => {
        const { terminal } = createTestTerminal(file);
        terminal.start();
        terminal.dispatch([{ screen: "two" }]);
        terminal.dispatch([{ screen: "help" }]);
        terminal.dispatch([{ back: true }]);
        expect(at(terminal)).toBe("two");
        terminal.dispatch([{ back: true }]);
        expect(at(terminal)).toBe("one");
        // nowhere further back: it stays
        terminal.dispatch([{ back: true }]);
        expect(at(terminal)).toBe("one");
    });

    it("starts afresh on a restart, and is saved", () => {
        const { terminal } = createTestTerminal(file);
        terminal.start();
        terminal.dispatch([{ screen: "two" }]);
        const saved = terminal.saveState();
        expect(saved.history).toEqual(["one"]);
        terminal.dispatch([{ restart: true }]);
        terminal.dispatch([{ back: true }]);
        expect(at(terminal)).toBe("one");

        const resumed = createTestTerminal(file).terminal;
        resumed.restoreState(saved);
        resumed.start();
        resumed.dispatch([{ back: true }]);
        expect(at(resumed)).toBe("one");
    });
});
