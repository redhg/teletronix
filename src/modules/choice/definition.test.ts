import { describe, expect, it } from "vitest";
import type { ScreenRun } from "../../engine/runtime/screen-run.ts";
import { createTestTerminal } from "../../engine/runtime/test-helpers.ts";
import { parseProgram, type TeletronixFile } from "../../engine/schema/program.ts";

const NBSP = " ";

const FILE: TeletronixFile = {
    config: { name: "T", variables: { mode: "AUTO", level: 2 } },
    screens: {
        home: {
            content: [
                {
                    type: "choice",
                    label: "MODE: ",
                    options: ["AUTO", "MANUAL OVERRIDE"],
                    variable: "mode",
                    onChange: { dialog: "changed" },
                },
                { type: "choice", options: ["LOW", "MID", "HIGH"], variable: "level" },
            ],
        },
    },
    dialogs: { changed: { type: "alert", content: "Now {mode}" } },
};

const start = () => {
    const test = createTestTerminal(FILE, { instant: true });
    test.terminal.start();
    return { ...test, run: test.terminal.getSnapshot().screen?.run as ScreenRun };
};
const drawn = (run: ScreenRun, index: number) => {
    let text = "";
    run.subscribeFrame(index, (frame) => {
        text = frame.map((segment) => segment.text).join("");
    })();
    return text.replaceAll(NBSP, " ");
};

describe("choice", () => {
    it("shows its options, marking the chosen one", () => {
        const { run } = start();
        expect(drawn(run, 0)).toBe("MODE: (•) AUTO  ( ) MANUAL OVERRIDE");
        expect(drawn(run, 1)).toBe("( ) LOW  ( ) MID  (•) HIGH");
    });

    it("keeps the option's text in a text variable, and runs onChange", () => {
        const { terminal, run } = start();
        terminal.remember("home#0", 1);
        expect(terminal.variable("mode")).toBe("MANUAL OVERRIDE");
        expect(drawn(run, 0)).toBe("MODE: ( ) AUTO  (•) MANUAL OVERRIDE");
        expect(terminal.getSnapshot().dialog?.id).toBe("changed");
    });

    it("keeps the option's index in a number variable", () => {
        const { terminal } = start();
        terminal.remember("home#1", 0);
        expect(terminal.variable("level")).toBe(0);
    });

    it("checks what it's bound to", () => {
        const result = parseProgram({
            config: { name: "T", variables: { mode: "OFF" } },
            screens: {
                home: {
                    content: [{ type: "choice", options: ["ON", "STANDBY"], variable: "mode" }],
                },
            },
        });
        expect(result.ok ? [] : result.errors.map((error) => error.message)).toEqual([
            "The variable must start as one of the options: ON, STANDBY",
        ]);
    });
});
