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

describe("multiple choice", () => {
    const MULTIPLE: TeletronixFile = {
        config: { name: "T", variables: { lights: true, air: false } },
        screens: {
            home: {
                content: [
                    {
                        type: "choice",
                        label: "SYSTEMS: ",
                        multiple: true,
                        options: ["LIGHTS", "HEAT", "AIR"],
                        variables: ["lights", null, "air"],
                        onChange: { dialog: "changed" },
                    },
                    { type: "choice", multiple: true, options: ["A", "B", "C"], initial: [0, 2] },
                ],
            },
        },
        dialogs: { changed: { type: "alert", content: "!" } },
    };
    const start = () => {
        const test = createTestTerminal(MULTIPLE, { instant: true });
        test.terminal.start();
        return { ...test, run: test.terminal.getSnapshot().screen?.run as ScreenRun };
    };

    it("ticks any number of options, drawn as checkboxes", () => {
        const { run } = start();
        expect(drawn(run, 0)).toBe("SYSTEMS: [X] LIGHTS  [ ] HEAT  [ ] AIR");
        expect(drawn(run, 1)).toBe("[X] A  [ ] B  [X] C");
    });

    it("keeps each tick in its option's variable, and the rest in memory", () => {
        const { terminal, run } = start();
        terminal.remember("home#0", [1, 2]);
        expect(terminal.variable("lights")).toBe(false);
        expect(terminal.variable("air")).toBe(true);
        expect(drawn(run, 0)).toBe("SYSTEMS: [ ] LIGHTS  [X] HEAT  [X] AIR");
        expect(terminal.getSnapshot().dialog?.id).toBe("changed");
        // and follows its variables when an action changes them
        terminal.answerDialog(true);
        terminal.dispatch([{ set: [{ variable: "lights", value: true }] }]);
        expect(drawn(run, 0)).toBe("SYSTEMS: [X] LIGHTS  [X] HEAT  [X] AIR");
    });

    it("can be a single checkbox, but a single choice needs two options", () => {
        const { terminal } = createTestTerminal(
            {
                config: { name: "T", variables: { sealed: true } },
                screens: {
                    home: {
                        content: [
                            {
                                type: "choice",
                                multiple: true,
                                options: ["AIRLOCK SEALED"],
                                variables: ["sealed"],
                            },
                        ],
                    },
                },
            },
            { instant: true },
        );
        terminal.start();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        expect(drawn(run, 0)).toBe("[X] AIRLOCK SEALED");
        terminal.remember("home#0", []);
        expect(terminal.variable("sealed")).toBe(false);

        const single = parseProgram({
            config: { name: "T" },
            screens: { home: { content: [{ type: "choice", options: ["ONLY"] }] } },
        });
        expect(single.ok ? [] : single.errors.map((e) => e.message)).toEqual([
            'A choice needs two options, or "multiple": true for a checkbox',
        ]);
    });

    it("checks how it's set up", () => {
        const result = parseProgram({
            config: { name: "T", variables: { count: 1, name: "x" } },
            screens: {
                home: {
                    content: [
                        {
                            type: "choice",
                            multiple: true,
                            options: ["A", "B"],
                            variables: ["count", "nope"],
                        },
                        {
                            type: "choice",
                            multiple: true,
                            options: ["A", "B"],
                            variable: "name",
                            initial: 1,
                        },
                        { type: "choice", options: ["A", "B"], initial: [1] },
                    ],
                },
            },
        });
        expect(result.ok ? [] : result.errors.map((e) => `${e.path}: ${e.message}`)).toEqual([
            "screens.home.content[1].initial: With multiple, initial is a list of options, e.g. [0, 2]",
            'screens.home.content[1].variable: With multiple, use "variables": one for each option',
            'screens.home.content[2].initial: initial is a list only with "multiple": true',
        ]);
        const bound = parseProgram({
            config: { name: "T", variables: { count: 1 } },
            screens: {
                home: {
                    content: [
                        {
                            type: "choice",
                            multiple: true,
                            options: ["A", "B"],
                            variables: ["count", "nope"],
                        },
                    ],
                },
            },
        });
        expect(bound.ok ? [] : bound.errors.map((e) => e.message)).toEqual([
            '"count" must be true or false',
            'Unknown variable "nope" (declare it in config.variables)',
        ]);
    });
});
