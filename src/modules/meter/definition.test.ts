import { describe, expect, it } from "vitest";
import type { ScreenRun } from "../../engine/runtime/screen-run.ts";
import { createTestTerminal } from "../../engine/runtime/test-helpers.ts";
import { parseProgram, type TeletronixFile } from "../../engine/schema/program.ts";
import { type MeterElement, meterClasses } from "./definition.ts";

const FILE: TeletronixFile = {
    config: {
        name: "Meters",
        variables: { hull: 100 },
        timers: { oxygen: { from: 100, to: 0, format: "ss", autostart: true } },
    },
    screens: {
        home: {
            content: [
                { type: "meter", label: "HULL ", variable: "hull", unit: "%", width: 10 },
                { type: "meter", label: "O2   ", variable: "oxygen", width: 10, showValue: false },
                { type: "link", text: "> HIT", action: { set: { hull: { add: -30 } } } },
            ],
        },
    },
};

const drawn = (run: ScreenRun, index: number) => {
    let text = "";
    run.subscribeFrame(index, (frame) => {
        text = frame.map((segment) => segment.text).join("");
    })();
    return text;
};

describe("meter", () => {
    it("shows a variable, and follows it", () => {
        const { terminal } = createTestTerminal(FILE, { instant: true });
        terminal.start();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        expect(drawn(run, 0)).toBe("HULL [██████████] 100%");
        terminal.dispatch([{ set: [{ variable: "hull", add: -30 }] }]);
        expect(drawn(run, 0)).toBe("HULL [███████░░░]  70%");
    });

    it("shows a timer's seconds as they run down", () => {
        const { terminal, ticker } = createTestTerminal(FILE, { instant: true });
        terminal.start();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        expect(drawn(run, 1)).toBe("O2   [██████████]");
        ticker.advance(50_000, 1000);
        expect(drawn(run, 1)).toBe("O2   [█████░░░░░]");
    });

    it("has the classes of the ranges its value is in", () => {
        const meter = {
            on: [
                { atMost: 40, className: "alert" },
                { atMost: 10, className: "blink" },
            ],
        };
        expect(meterClasses(meter as MeterElement, 60)).toEqual([]);
        expect(meterClasses(meter as MeterElement, 5)).toEqual(["alert", "blink"]);
    });

    it("needs a number to show", () => {
        const result = parseProgram({
            config: { name: "T", variables: { name: "x" } },
            screens: {
                home: {
                    content: [
                        { type: "meter", variable: "name" },
                        { type: "meter", variable: "nope" },
                    ],
                },
            },
        });
        expect(result.ok ? [] : result.errors.map((error) => error.message)).toEqual([
            '"name" isn\'t a number',
            'Unknown variable or timer "nope"',
        ]);
    });
});
