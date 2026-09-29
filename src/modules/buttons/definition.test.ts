import { describe, expect, it } from "vitest";
import type { ScreenRun } from "../../engine/runtime/screen-run.ts";
import { createTestTerminal } from "../../engine/runtime/test-helpers.ts";
import type { TeletronixFile } from "../../engine/schema/program.ts";
import { type Button, hotkeyIndex } from "./definition.ts";

const NBSP = "\u00a0";

const FILE = (waitForReveal = false): TeletronixFile => ({
    config: { name: "Test", waitForReveal },
    screens: {
        home: {
            content: [
                {
                    type: "buttons",
                    buttons: [
                        { text: "ENGAGE", key: "e", action: { screen: "launch" } },
                        { text: "ABORT", key: "Esc", action: { dialog: "aborted" } },
                    ],
                },
                "more text after the buttons",
            ],
        },
        launch: { content: ["LAUNCH"] },
    },
    dialogs: { aborted: { type: "alert", content: "!" } },
});

const screenId = (terminal: ReturnType<typeof createTestTerminal>["terminal"]) =>
    terminal.getSnapshot().screen?.run.screen.id;

describe("buttons", () => {
    it("draw a row of bracketed labels, which wraps only between buttons", () => {
        const { terminal } = createTestTerminal(FILE(), { instant: true, columns: 12 });
        terminal.start();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        let drawn = "";
        run.subscribeFrame(0, (frame) => {
            drawn = frame.map((segment) => segment.text).join("");
        })();
        // (no-break spaces inside the brackets; the gap is two spaces, and wrapping replaces one)
        expect(drawn).toBe(`[${NBSP}ENGAGE${NBSP}] \n[${NBSP}ABORT${NBSP}]`);
    });

    it("are pressed by their hotkeys, from anywhere on the screen", () => {
        const { terminal } = createTestTerminal(FILE(), { instant: true });
        terminal.start();
        expect(terminal.pressKey("Escape")).toBe(true);
        expect(terminal.getSnapshot().dialog?.id).toBe("aborted");
        terminal.answerDialog(true);
        expect(terminal.pressKey("E")).toBe(true);
        expect(screenId(terminal)).toBe("launch");
    });

    it("only once they can be used", () => {
        const { terminal, ticker } = createTestTerminal(FILE(true));
        terminal.start();
        ticker.advance(200, 10);
        // the buttons are revealed, but the rest of the screen isn't yet
        expect(terminal.pressKey("e")).toBe(false);
        ticker.advance(1000, 10);
        expect(terminal.pressKey("e")).toBe(true);
        expect(screenId(terminal)).toBe("launch");
    });

    it("underline their hotkey's letter", () => {
        const button = (text: string, key?: string) => ({ text, key, action: [] }) as Button;
        expect(hotkeyIndex(button("ENGAGE", "g"))).toBe(2);
        expect(hotkeyIndex(button("ENGAGE", "x"))).toBe(-1);
        expect(hotkeyIndex(button("ENGAGE", "enter"))).toBe(-1);
        expect(hotkeyIndex(button("ENGAGE"))).toBe(-1);
    });
});
