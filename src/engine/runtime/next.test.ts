import { describe, expect, it } from "vitest";
import { normalizeKey, ruleForKey, ruleForTap } from "../schema/next.ts";
import { parseProgram, type TeletronixFile } from "../schema/program.ts";
import { createTestTerminal } from "./test-helpers.ts";

const FILE: TeletronixFile = {
    config: { name: "Test", defaults: { teletype: { speed: 10 } } },
    screens: {
        noise: {
            effects: { static: { opacity: 1 } },
            next: { after: 500, action: { screen: "boot" } },
            content: [],
        },
        // "abc" types in 30ms, then waits 100ms
        boot: { next: { after: 100, action: { screen: "menu" } }, content: ["abc"] },
        menu: { content: ["menu"] },
        any: { next: { key: "any", action: { screen: "menu" } }, content: ["press a key"] },
        choice: {
            next: [
                { key: ["y", "Enter"], action: { screen: "boot" } },
                { key: "n", action: { screen: "menu" } },
                { after: 1000, action: { screen: "noise" } },
            ],
            content: [],
        },
        alarm: { next: { after: 50, action: { dialog: "warning" } }, content: [] },
    },
    dialogs: { warning: { type: "alert", content: "!" } },
};

const screenId = (terminal: ReturnType<typeof createTestTerminal>["terminal"]) =>
    terminal.getSnapshot().screen?.run.screen.id;

describe("timed next", () => {
    it("moves on from an empty screen after its delay", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.navigate("noise");
        expect(terminal.getSnapshot().screen?.states).toEqual([]);
        expect(ticker.active).toBe(true);
        ticker.advance(499);
        expect(screenId(terminal)).toBe("noise");
        ticker.advance(1);
        expect(screenId(terminal)).toBe("boot");
    });

    it("counts the delay from when the screen has finished revealing", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.navigate("boot");
        ticker.advance(129);
        expect(screenId(terminal)).toBe("boot");
        ticker.advance(1);
        expect(screenId(terminal)).toBe("menu");
        ticker.advance(40); // "menu" types in
        expect(ticker.active).toBe(false);
    });

    it("counts from a skip", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.navigate("boot");
        ticker.advance(5);
        terminal.skip();
        ticker.advance(99);
        expect(screenId(terminal)).toBe("boot");
        ticker.advance(1);
        expect(screenId(terminal)).toBe("menu");
    });

    it("is cancelled by navigating away first", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.navigate("noise");
        ticker.advance(200);
        terminal.navigate("menu");
        ticker.advance(1000);
        expect(screenId(terminal)).toBe("menu");
    });

    it("fires only once, e.g. when it opens a dialog", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.navigate("alarm");
        ticker.advance(50);
        expect(terminal.getSnapshot().dialog?.id).toBe("warning");
        terminal.answerDialog(true);
        ticker.advance(1000);
        expect(terminal.getSnapshot().dialog).toBeNull();
        expect(ticker.active).toBe(false);
    });
});

describe("keys", () => {
    it("moves on at the rule's keys, first to match wins", () => {
        for (const [key, target] of [
            ["y", "boot"],
            ["Y", "boot"],
            ["Enter", "boot"],
            ["n", "menu"],
        ] as const) {
            const { terminal } = createTestTerminal(FILE);
            terminal.navigate("choice");
            expect(terminal.pressKey(key)).toBe(true);
            expect(screenId(terminal)).toBe(target);
        }
    });

    it("ignores other keys", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.navigate("choice");
        expect(terminal.pressKey("x")).toBe(false);
        expect(screenId(terminal)).toBe("choice");
    });

    it("still times out if no key comes", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.navigate("choice");
        ticker.advance(1000);
        expect(screenId(terminal)).toBe("noise");
    });

    it('takes any key for "any", except modifiers and Tab', () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.navigate("any");
        terminal.skip();
        expect(terminal.pressKey("Shift")).toBe(false);
        expect(terminal.pressKey("Tab")).toBe(false);
        expect(terminal.pressKey("q")).toBe(true);
        expect(screenId(terminal)).toBe("menu");
    });

    it("finishes the reveal on the first press and moves on with the second", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.navigate("any");
        expect(terminal.pressKey("q")).toBe(true);
        expect(screenId(terminal)).toBe("any");
        expect(terminal.getSnapshot().screen?.states).toEqual(["done"]);
        terminal.pressKey("q");
        expect(screenId(terminal)).toBe("menu");
    });

    it("doesn't move on while a dialog is open", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.navigate("choice");
        terminal.openDialog("warning");
        expect(terminal.pressKey("y")).toBe(false);
        expect(screenId(terminal)).toBe("choice");
    });

    it("does nothing on screens without keys", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.navigate("menu");
        expect(terminal.pressKey("Enter")).toBe(false);
        expect(terminal.tap()).toBe(false);
    });
});

describe("taps", () => {
    it("stand in for a key once the screen is revealed", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.navigate("any");
        expect(terminal.tap()).toBe(false); // still revealing: the click just skips
        terminal.skip();
        expect(terminal.tap()).toBe(true);
        expect(screenId(terminal)).toBe("menu");
    });

    it("don't choose between keys that lead to different places", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.navigate("choice");
        expect(terminal.tap()).toBe(false);
        expect(screenId(terminal)).toBe("choice");
    });
});

describe("next schema", () => {
    const withNext = (next: unknown) =>
        parseProgram({ ...FILE, screens: { ...FILE.screens, menu: { next, content: [] } } });
    const rules = (next: unknown) => {
        const result = withNext(next);
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        return result.program.screens.get("menu")?.next;
    };

    it("accepts one rule or a list, and normalizes keys", () => {
        expect(rules({ key: "Space", action: { screen: "boot" } })).toEqual([
            { keys: [" "], action: [{ screen: "boot" }] },
        ]);
        expect(rules([{ after: 5, key: ["Esc", "F"], action: { screen: "boot" } }])).toEqual([
            { after: 5, keys: ["escape", "f"], action: [{ screen: "boot" }] },
        ]);
    });

    it("needs a delay, a key, or both", () => {
        const result = withNext({ action: { screen: "boot" } });
        expect(result.ok ? [] : result.errors).toEqual([
            { path: "screens.menu.next", message: 'Set "after", "key", or both' },
        ]);
    });

    it("checks each rule's target", () => {
        const result = withNext([
            { key: "a", action: { screen: "boot" } },
            { key: "b", action: { screen: "nowhere" } },
        ]);
        expect(result.ok ? [] : result.errors).toEqual([
            { path: "screens.menu.next[1].action", message: 'Unknown screen "nowhere"' },
        ]);
    });
});

describe("key helpers", () => {
    const go = [{ screen: "a" }];
    it("normalize names", () => {
        expect(normalizeKey("ArrowRight")).toBe("arrowright");
        expect(normalizeKey("Return")).toBe("enter");
    });
    it("match keys and taps", () => {
        expect(ruleForKey([{ keys: [" "], action: go }], " ")).toBeDefined();
        expect(ruleForTap([{ after: 1, action: go }])).toBeUndefined();
        expect(
            ruleForTap([
                { keys: ["a"], action: go },
                { keys: ["b"], action: go },
            ]),
        ).toBeDefined();
    });
});
