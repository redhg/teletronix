import { describe, expect, it } from "vitest";
import { parseProgram, type TeletronixFile } from "../schema/program.ts";
import { type Clock, formatTime } from "../schema/timers.ts";
import type { ScreenRun } from "./screen-run.ts";
import type { Terminal } from "./terminal.ts";
import { createTestTerminal } from "./test-helpers.ts";

const FILE: TeletronixFile = {
    config: {
        name: "Timers",
        variables: { armed: false },
        timers: {
            destruct: { from: 10, onComplete: { screen: "boom" } },
            clock: { from: 0, to: 3600, format: "hh:mm:ss", autostart: true },
        },
    },
    screens: {
        bridge: {
            content: [
                "DESTRUCT IN {destruct}",
                {
                    type: "link",
                    text: "> ARM",
                    action: { startTimer: "destruct", screen: "corridor" },
                },
                { type: "link", text: "> HOLD", action: { stopTimer: "destruct" } },
                { type: "link", text: "> DISARM", action: { resetTimer: "destruct" } },
            ],
        },
        corridor: {
            content: [
                { type: "timer", label: "T-MINUS ", timer: "destruct" },
                { type: "text", text: "HURRY", if: { destruct: { atMost: 5 } } },
            ],
        },
        airlock: {
            content: [
                {
                    type: "timer",
                    label: "CYCLE ",
                    from: 3,
                    format: "ss",
                    onComplete: { screen: "space" },
                },
            ],
        },
        boom: { content: ["BOOM"] },
        space: { content: ["SPACE"] },
    },
};

const start = () => {
    const test = createTestTerminal(FILE, { instant: true });
    test.terminal.start();
    return test;
};
const screenId = (terminal: Terminal) => terminal.getSnapshot().screen?.run.screen.id;
const texts = (terminal: Terminal) => {
    const run = terminal.getSnapshot().screen?.run as ScreenRun;
    return run.elements.map((_, index) => {
        let text = "";
        run.subscribeFrame(index, (_frame, current) => {
            text = current;
        })();
        return text;
    });
};
const link = (terminal: Terminal, text: string) => {
    const element = terminal
        .getSnapshot()
        .screen?.run.elements.find((e) => e.type === "link" && e.text === text);
    if (element?.type !== "link") throw new Error(`No link "${text}"`);
    return element.action;
};

describe("program timers", () => {
    it("show in text, and start at an action", () => {
        const { terminal, ticker } = start();
        expect(texts(terminal)[0]).toBe("DESTRUCT IN 00:10");
        ticker.advance(2000, 100);
        expect(texts(terminal)[0]).toBe("DESTRUCT IN 00:10");

        terminal.dispatch(link(terminal, "> ARM"));
        expect(screenId(terminal)).toBe("corridor");
        expect(texts(terminal)[0]).toBe("T-MINUS 00:10");
        ticker.advance(1000, 100);
        expect(texts(terminal)[0]).toBe("T-MINUS 00:09");
        expect(terminal.variable("destruct")).toBe(9);
    });

    it("keep running from screen to screen, and run onComplete wherever the player is", () => {
        const { terminal, ticker } = start();
        terminal.dispatch(link(terminal, "> ARM"));
        ticker.advance(6000, 100);
        terminal.navigate("corridor");
        // conditions test a timer's seconds
        expect(texts(terminal)).toEqual(["T-MINUS 00:04", "HURRY"]);
        terminal.navigate("bridge");
        ticker.advance(4000, 100);
        expect(screenId(terminal)).toBe("boom");
    });

    it("stop, carry on, and reset", () => {
        const { terminal, ticker } = start();
        terminal.dispatch([{ startTimer: "destruct" }]);
        ticker.advance(3000, 100);
        terminal.dispatch(link(terminal, "> HOLD"));
        ticker.advance(5000, 100);
        expect(terminal.variable("destruct")).toBe(7);
        terminal.dispatch([{ startTimer: "destruct" }]);
        ticker.advance(2000, 100);
        expect(terminal.variable("destruct")).toBe(5);
        terminal.dispatch(link(terminal, "> DISARM"));
        ticker.advance(20_000, 100);
        expect(terminal.variable("destruct")).toBe(10);
        expect(screenId(terminal)).toBe("bridge");
    });

    it("can start with the program, count up, and start over on restart", () => {
        const { terminal, ticker } = start();
        ticker.advance(65_000, 1000);
        expect(terminal.format("{clock}")).toBe("00:01:05");
        terminal.restart();
        expect(terminal.format("{clock}")).toBe("00:00:00");
        ticker.advance(1000, 100);
        expect(terminal.format("{clock}")).toBe("00:00:01");
    });
});

describe("a timer element's own timer", () => {
    it("starts once revealed and runs onComplete", () => {
        const { terminal, ticker } = start();
        terminal.navigate("airlock");
        expect(texts(terminal)[0]).toBe("CYCLE 3");
        ticker.advance(1000, 100);
        expect(texts(terminal)[0]).toBe("CYCLE 2");
        ticker.advance(2000, 100);
        expect(screenId(terminal)).toBe("space");
    });

    it("goes when the screen does", () => {
        const { terminal, ticker } = start();
        terminal.navigate("airlock");
        ticker.advance(1000, 100);
        terminal.navigate("bridge");
        ticker.advance(5000, 100);
        expect(screenId(terminal)).toBe("bridge");
        // and starts over on the way back
        terminal.navigate("airlock");
        expect(texts(terminal)[0]).toBe("CYCLE 3");
    });
});

describe("timer checks", () => {
    const errors = (config: object, content: unknown[] = []) => {
        const result = parseProgram({
            config: { name: "T", ...config },
            screens: { home: { content } },
        } as TeletronixFile);
        return result.ok ? [] : result.errors.map((error) => `${error.path}: ${error.message}`);
    };

    it("report unknown timers and clashing names", () => {
        expect(
            errors({ variables: { t: 1 }, timers: { t: { from: 5 } } }, [
                { type: "link", text: "x", action: { startTimer: "nope" } },
                { type: "timer", timer: "gone" },
            ]),
        ).toEqual([
            'config.timers.t: "t" is a variable already; name the timer differently',
            'screens.home.content[0]: Unknown timer "nope" (declare it in config.timers)',
            'screens.home.content[1].timer: Unknown timer "gone" (declare it in config.timers)',
        ]);
    });

    it("need a timer to go somewhere", () => {
        expect(errors({ timers: { t: { from: 0 } } })).toEqual([
            'config.timers.t: "from" and "to" must differ',
        ]);
    });
});

describe("formatTime", () => {
    const clock = (format: Clock["format"], down = true): Clock => ({
        from: down ? 100 : 0,
        to: down ? 0 : 100,
        format,
    });

    it("shows a countdown's part-seconds as whole ones", () => {
        expect(formatTime(clock("mm:ss"), 89_001)).toBe("01:30");
        expect(formatTime(clock("mm:ss"), 0)).toBe("00:00");
        expect(formatTime(clock("ss"), 4_500)).toBe("5");
        expect(formatTime(clock("hh:mm:ss"), 3_725_000)).toBe("01:02:05");
    });

    it("counts up in whole seconds", () => {
        expect(formatTime(clock("mm:ss", false), 59_999)).toBe("00:59");
    });
});
