import { describe, expect, it } from "vitest";
import type { ScreenRun } from "../../engine/runtime/screen-run.ts";
import { createTestTerminal } from "../../engine/runtime/test-helpers.ts";
import type { TeletronixFile } from "../../engine/schema/program.ts";
import { highlighted, type MenuElement } from "./definition.ts";

const FILE: TeletronixFile = {
    config: { name: "T" },
    screens: {
        home: {
            content: [
                {
                    type: "menu",
                    items: [
                        { text: "1. DIAGNOSTICS", key: "1", action: { screen: "diagnostics" } },
                        { text: "2. SHUT DOWN", key: "2", action: { dialog: "sure" } },
                    ],
                },
            ],
        },
        diagnostics: { content: ["ALL CLEAR"] },
    },
    dialogs: { sure: { type: "alert", content: "!" } },
};

describe("menu", () => {
    it("lists its items, with room for the marker", () => {
        const { terminal } = createTestTerminal(FILE, { instant: true });
        terminal.start();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        let drawn = "";
        run.subscribeFrame(0, (frame) => {
            drawn = frame.map((segment) => segment.text).join("");
        })();
        expect(drawn).toBe("  1. DIAGNOSTICS\n  2. SHUT DOWN");
    });

    it("chooses an item with its hotkey", () => {
        const { terminal } = createTestTerminal(FILE, { instant: true });
        terminal.start();
        expect(terminal.pressKey("2")).toBe(true);
        expect(terminal.getSnapshot().dialog?.id).toBe("sure");
        terminal.answerDialog(true);
        terminal.pressKey("1");
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("diagnostics");
    });

    it("keeps the highlight on an item", () => {
        const menu = { items: [{}, {}, {}] } as MenuElement;
        expect(highlighted(menu, undefined)).toBe(0);
        expect(highlighted(menu, 7)).toBe(2);
    });
});
