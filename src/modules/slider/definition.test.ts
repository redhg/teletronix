import { describe, expect, it } from "vitest";
import type { Frame } from "../../engine/reveal/types.ts";
import { createTestTerminal } from "../../engine/runtime/test-helpers.ts";
import { parseProgram } from "../../engine/schema/program.ts";
import { type SliderElement, sliderClasses, sliderLine, snapValue, valueAt } from "./definition.ts";

const slider = (overrides: Partial<SliderElement> = {}): SliderElement => ({
    id: "x",
    type: "slider",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
    showValue: true,
    fill: "#",
    empty: ".",
    ...overrides,
});

describe("slider values", () => {
    it("snaps to its steps and range, without floating-point tails", () => {
        const tuner = slider({ min: 88, max: 108, step: 0.1 });
        expect(snapValue(tuner, 101.14)).toBe(101.1);
        expect(snapValue(tuner, 200)).toBe(108);
        expect(snapValue(slider({ step: 5 }), 43)).toBe(45);
    });

    it("maps a position along the bar to a value", () => {
        expect(valueAt(slider({ step: 5 }), 0.52)).toBe(50);
        expect(valueAt(slider(), -1)).toBe(0);
        expect(valueAt(slider(), 2)).toBe(100);
    });

    it("draws a bar with room for its widest value", () => {
        // 20 columns - "[" - "]" - " 100%" = 13 cells
        expect(sliderLine(slider(), 50, 20)).toBe("[#######......]  50%");
        const tuner = slider({
            label: "FM ",
            min: 88,
            max: 108,
            step: 0.1,
            unit: " MHz",
            width: 5,
        });
        expect(sliderLine(tuner, 98, 80)).toBe("FM [###..]  98.0 MHz");
    });
});

const FILE = {
    config: { name: "Test", reveal: "instant" as const },
    screens: {
        dial: {
            content: [
                {
                    type: "slider" as const,
                    value: 50,
                    step: 5,
                    on: [
                        { atLeast: 90, action: { dialog: "hot" } },
                        { equals: 20, action: { screen: "found" } },
                    ],
                    onEnter: { dialog: "hot" },
                },
            ],
        },
        found: { content: ["found it"] },
    },
    dialogs: { hot: { type: "alert" as const, content: "Too hot!" } },
};

describe("slider in a program", () => {
    const setup = () => {
        const { terminal } = createTestTerminal(FILE, { columns: 20 });
        terminal.start();
        const run = terminal.getSnapshot().screen?.run;
        const id = run?.elements[0]?.id ?? "";
        const lines: string[] = [];
        run?.subscribeFrame(0, (frame: Frame) => lines.push(frame.map((s) => s.text).join("")));
        return { terminal, id, lines };
    };

    it("redraws as its value changes, and remembers it", () => {
        const { terminal, id, lines } = setup();
        terminal.remember(id, 75);
        expect(lines.at(-1)).toMatch(/ 75$/);
        terminal.navigate("found");
        terminal.navigate("dial");
        const again: string[] = [];
        terminal
            .getSnapshot()
            .screen?.run.subscribeFrame(0, (f) => again.push(f.map((s) => s.text).join("")));
        expect(again.at(-1)).toMatch(/ 75$/);
    });

    it("fires a rule when the value moves into its range, once per entry", () => {
        const { terminal, id } = setup();
        terminal.remember(id, 85);
        expect(terminal.getSnapshot().dialog).toBeNull();
        terminal.remember(id, 90);
        expect(terminal.getSnapshot().dialog?.id).toBe("hot");
        terminal.answerDialog(true);
        terminal.remember(id, 95); // still in range: nothing new
        expect(terminal.getSnapshot().dialog).toBeNull();
        terminal.remember(id, 50);
        terminal.remember(id, 100); // back in range: fires again
        expect(terminal.getSnapshot().dialog?.id).toBe("hot");
    });

    it("fires equals rules on exactly that value", () => {
        const { terminal, id } = setup();
        terminal.remember(id, 25);
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("dial");
        terminal.remember(id, 20);
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("found");
    });
});

describe("slider range classes", () => {
    const reactor = slider({
        on: [
            { atLeast: 60, className: "warm" },
            { atLeast: 80, className: "alert" },
            { atLeast: 95, action: [{ dialog: "hot" }] },
        ],
    });

    it("apply while the value is in their range, adding up", () => {
        expect(sliderClasses(reactor, 50)).toEqual([]);
        expect(sliderClasses(reactor, 60)).toEqual(["warm"]);
        expect(sliderClasses(reactor, 85)).toEqual(["warm", "alert"]);
    });

    it("don't fire, but let a rule with an action behind them fire", () => {
        const { terminal } = createTestTerminal(
            {
                config: { name: "T" },
                screens: {
                    s: {
                        content: [
                            {
                                type: "slider",
                                on: [
                                    { atLeast: 80, className: "alert" },
                                    { atLeast: 95, action: { dialog: "hot" } },
                                ],
                            },
                        ],
                    },
                },
                dialogs: { hot: { type: "alert", content: "!" } },
            },
            { instant: true },
        );
        terminal.start();
        const id = terminal.getSnapshot().screen?.run.elements[0]?.id ?? "";
        terminal.remember(id, 85);
        expect(terminal.getSnapshot().dialog).toBeNull();
        terminal.remember(id, 95);
        expect(terminal.getSnapshot().dialog?.id).toBe("hot");
    });
});

describe("slider schema", () => {
    const parse = (props: object) =>
        parseProgram({
            config: { name: "T" },
            screens: { s: { content: [{ type: "slider", ...props }] } },
        });

    it("wants max above min and value inside the range", () => {
        const result = parse({ min: 10, max: 5, value: 20 });
        expect(result.ok ? [] : result.errors.map((e) => e.path)).toEqual([
            "screens.s.content[0].max",
            "screens.s.content[0].value",
        ]);
    });

    it("wants each rule to have an action or a class", () => {
        const result = parse({ on: [{ atLeast: 5 }] });
        expect(result.ok ? [] : result.errors.map((e) => e.message)).toEqual([
            'Set "action", "className", or both',
        ]);
    });

    it("wants each rule to have a condition", () => {
        const result = parse({ on: [{ action: { screen: "s" } }] });
        expect(result.ok ? [] : result.errors.map((e) => e.message)).toEqual([
            'Set "atLeast", "atMost" or "equals" (or a combination)',
        ]);
    });
});
