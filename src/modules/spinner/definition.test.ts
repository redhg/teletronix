import { describe, expect, it } from "vitest";
import type { Frame } from "../../engine/reveal/types.ts";
import type { ScreenRun } from "../../engine/runtime/screen-run.ts";
import { createTestTerminal } from "../../engine/runtime/test-helpers.ts";
import type { TeletronixFile } from "../../engine/schema/program.ts";
import { type SpinnerElement, spinnerFrames, spinnerLine } from "./definition.ts";

// the label appears at once, then the spinner turns
const setup = (spinner: object) => {
    const file: TeletronixFile = {
        config: { name: "Test", reveal: "instant" },
        screens: {
            home: { content: [{ type: "spinner", label: "LOAD ", ...spinner } as never, "AFTER"] },
            next: { content: ["NEXT"] },
            aborted: { content: ["ABORTED SCREEN"] },
        },
    };
    const { terminal, ticker } = createTestTerminal(file);
    terminal.start();
    const run = () => terminal.getSnapshot().screen?.run as ScreenRun;
    const lines: string[] = [];
    run().subscribeFrame(0, (frame: Frame) => lines.push(frame.map((s) => s.text).join("")));
    const line = () => lines.at(-1);
    return { terminal, ticker, run, line };
};

describe("spinner", () => {
    it("turns for its duration, holding the screen, then shows its done text", () => {
        const { ticker, run, line } = setup({ duration: 1000, done: "OK" });
        expect(line()).toBe("LOAD |");
        ticker.advance(100);
        expect(line()).toBe("LOAD /");
        ticker.advance(100);
        expect(line()).toBe("LOAD -");
        expect(run().states).toEqual(["active", "ready"]);
        ticker.advance(800);
        expect(line()).toBe("LOAD OK");
        expect(run().states).toEqual(["done", "done"]);
    });

    it("goes, without done text", () => {
        const { ticker, line } = setup({ duration: 300 });
        ticker.advance(300);
        expect(line()).toBe("");
    });

    it("counts down the seconds", () => {
        const { ticker, line } = setup({ duration: 12_000, countdown: true });
        expect(line()).toBe("LOAD | 12");
        ticker.advance(2500);
        expect(line()).toMatch(/^LOAD . 10$/);
        ticker.advance(9000);
        expect(line()).toMatch(/^LOAD . {2}1$/);
    });

    it("spins until a key, without a duration", () => {
        const { terminal, ticker, run, line } = setup({ done: "READY" });
        ticker.advance(60_000, 1000);
        expect(run().states).toEqual(["active", "ready"]);
        // a modifier alone isn't a key press
        expect(terminal.pressKey("Shift")).toBe(false);
        expect(terminal.pressKey("x")).toBe(true);
        expect(line()).toBe("LOAD READY");
        expect(run().states).toEqual(["done", "done"]);
    });

    it("runs onComplete when it finishes", () => {
        const { terminal, ticker } = setup({ duration: 500, onComplete: { screen: "next" } });
        ticker.advance(500);
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("next");
    });

    it("aborts at its interrupt key, with its text and action", () => {
        const { terminal, ticker, line } = setup({
            duration: 5000,
            onComplete: { screen: "next" },
            interrupt: {
                key: "Escape",
                text: "CANCELLED",
                action: { screen: "aborted" },
                after: 200,
            },
        });
        ticker.advance(1000);
        // other keys don't stop one with a duration
        expect(terminal.pressKey("x")).toBe(false);
        expect(terminal.pressKey("Escape")).toBe(true);
        expect(line()).toBe("LOAD CANCELLED");
        ticker.advance(200);
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("aborted");
    });

    it("tells its interrupt key from any other, when it spins until a key", () => {
        const spinner = {
            done: "GO",
            interrupt: { key: "Escape" },
            onComplete: { screen: "next" },
        };
        const aborted = setup(spinner);
        aborted.terminal.pressKey("Escape");
        expect(aborted.line()).toBe("LOAD ABORTED");
        expect(aborted.terminal.getSnapshot().screen?.run.screen.id).toBe("home");

        const carried = setup(spinner);
        carried.terminal.pressKey("Enter");
        expect(carried.terminal.getSnapshot().screen?.run.screen.id).toBe("next");
    });

    it("finishes at once when skipped", () => {
        const { terminal, run, line } = setup({ duration: 5000, done: "OK" });
        terminal.skip();
        expect(line()).toBe("LOAD OK");
        expect(run().states).toEqual(["done", "done"]);
    });
});

describe("spinner frames", () => {
    const spinner = (overrides: Partial<SpinnerElement>): SpinnerElement => ({
        id: "x",
        type: "spinner",
        label: "",
        style: "line",
        countdown: false,
        ...overrides,
    });

    it("are all one width, so the line never jumps", () => {
        expect(spinnerFrames(spinner({ style: ["a", "bbb"] }))).toEqual(["a  ", "bbb"]);
        expect(new Set(spinnerFrames(spinner({ style: "bar" })).map((f) => f.length)).size).toBe(1);
    });

    it("keep the countdown's width as it shrinks", () => {
        const counting = spinner({ countdown: true, duration: 10_000 });
        expect(spinnerLine(counting, "|", 10_000)).toBe("| 10");
        expect(spinnerLine(counting, "|", 900)).toBe("|  1");
    });
});
