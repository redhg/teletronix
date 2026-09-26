import { describe, expect, it } from "vitest";
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
        key: { next: { anyKey: true, action: { screen: "menu" } }, content: ["press a key"] },
        alarm: { next: { after: 50, action: { dialog: "warning" } }, content: [] },
    },
    dialogs: { warning: { type: "alert", content: "!" } },
};

const screenId = (terminal: ReturnType<typeof createTestTerminal>["terminal"]) =>
    terminal.getSnapshot().screen?.run.screen.id;

describe("next", () => {
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

    it("moves on at any key when asked, and not otherwise", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.navigate("menu");
        expect(terminal.proceed()).toBe(false);
        terminal.navigate("key");
        expect(terminal.proceed()).toBe(true);
        expect(screenId(terminal)).toBe("menu");
    });

    it("doesn't move on at a key while a dialog is open", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.navigate("key");
        terminal.openDialog("warning");
        expect(terminal.proceed()).toBe(false);
        expect(screenId(terminal)).toBe("key");
    });
});

describe("next schema", () => {
    const withNext = (next: unknown) =>
        parseProgram({ ...FILE, screens: { ...FILE.screens, menu: { next, content: [] } } });

    it("needs a delay, anyKey, or both", () => {
        const result = withNext({ action: { screen: "boot" } });
        expect(result.ok ? [] : result.errors).toEqual([
            { path: "screens.menu.next", message: 'Set "after", "anyKey", or both' },
        ]);
    });

    it("checks its target", () => {
        const result = withNext({ after: 1, action: { screen: "nowhere" } });
        expect(result.ok ? [] : result.errors).toEqual([
            { path: "screens.menu.next.action", message: 'Unknown screen "nowhere"' },
        ]);
    });
});
