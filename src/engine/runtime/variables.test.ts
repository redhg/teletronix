import { describe, expect, it } from "vitest";
import { seededRandom } from "../random.ts";
import { parseProgram, type TeletronixFile } from "../schema/program.ts";
import type { Terminal } from "./terminal.ts";
import { createTestTerminal } from "./test-helpers.ts";

const FILE: TeletronixFile = {
    config: {
        name: "Vault",
        variables: { keycard: false, power: 40, name: "stranger", lights: false, door: 0 },
    },
    screens: {
        hall: {
            content: [
                "Hello, {name}. Power at {power}%.",
                { type: "text", text: "A KEYCARD GLINTS", if: { keycard: false } },
                {
                    type: "link",
                    text: "> TAKE THE KEYCARD",
                    if: { keycard: false },
                    action: { set: { keycard: true }, screen: "hall" },
                },
                {
                    type: "link",
                    text: "> OPEN THE VAULT",
                    action: [{ if: { keycard: true }, screen: "vault" }, { dialog: "locked" }],
                },
                { type: "link", text: "> BOOST", action: { set: { power: { add: 10 } } } },
                { type: "toggle", states: ["[ ] LIGHTS", "[X] LIGHTS"], variable: "lights" },
                { type: "toggle", states: ["SHUT", "AJAR", "OPEN"], variable: "door" },
                { type: "slider", label: "POWER ", variable: "power", step: 10 },
            ],
        },
        vault: { content: ["THE VAULT"] },
        dark: {
            next: [
                { key: "l", if: { lights: true }, action: { screen: "vault" } },
                { key: "l", action: { set: { lights: true } } },
                { after: 100, if: { lights: true }, action: { screen: "hall" } },
            ],
            content: ["DARK"],
        },
        name: {
            content: [
                {
                    type: "prompt",
                    variable: "name",
                    commands: [
                        { command: "vault", if: { keycard: true }, action: { screen: "vault" } },
                    ],
                    onEnter: { screen: "hall" },
                },
            ],
        },
    },
    dialogs: { locked: { type: "alert", content: "Locked, {name}." } },
};

const start = (screen = "hall") => {
    const test = createTestTerminal(FILE, { instant: true });
    test.terminal.navigate(screen);
    return test;
};

/** The current screen's elements' texts. */
const texts = (terminal: Terminal) => {
    const run = terminal.getSnapshot().screen?.run;
    return (run?.elements ?? []).map((_, index) => {
        let text = "";
        run?.subscribeFrame(index, (_frame, current) => {
            text = current;
        })();
        return text;
    });
};
const screenId = (terminal: Terminal) => terminal.getSnapshot().screen?.run.screen.id;
const link = (terminal: Terminal, text: string) => {
    const element = terminal
        .getSnapshot()
        .screen?.run.elements.find((e) => e.type === "link" && e.text === text);
    if (element?.type !== "link") throw new Error(`No link "${text}"`);
    return element;
};

describe("variables", () => {
    it("start from their declared values, and show in text", () => {
        const { terminal } = start();
        expect(terminal.variable("power")).toBe(40);
        expect(texts(terminal)[0]).toBe("Hello, stranger. Power at 40%.");
    });

    it("are set by actions, and the text follows", () => {
        const { terminal } = start();
        terminal.dispatch(link(terminal, "> BOOST").action);
        expect(terminal.variable("power")).toBe(50);
        expect(screenId(terminal)).toBe("hall");
        expect(texts(terminal)[0]).toBe("Hello, stranger. Power at 50%.");
    });

    it("show in dialogs", () => {
        const { terminal } = start();
        expect(terminal.format("Locked, {name}.")).toBe("Locked, stranger.");
    });
});

describe("conditions", () => {
    it("decide which elements a screen shows, when it starts", () => {
        const { terminal } = start();
        expect(texts(terminal)).toContain("A KEYCARD GLINTS");
        terminal.dispatch(link(terminal, "> TAKE THE KEYCARD").action);
        expect(terminal.variable("keycard")).toBe(true);
        expect(texts(terminal)).not.toContain("A KEYCARD GLINTS");
        expect(texts(terminal)).not.toContain("> TAKE THE KEYCARD");
    });

    it("choose an action's first case that holds", () => {
        const { terminal } = start();
        terminal.dispatch(link(terminal, "> OPEN THE VAULT").action);
        expect(terminal.getSnapshot().dialog?.id).toBe("locked");
        terminal.answerDialog(true);
        terminal.dispatch(link(terminal, "> TAKE THE KEYCARD").action);
        terminal.dispatch(link(terminal, "> OPEN THE VAULT").action);
        expect(screenId(terminal)).toBe("vault");
    });

    it("decide which next rules apply, and a key rule can run again", () => {
        const { terminal, ticker } = start("dark");
        ticker.advance(500);
        expect(screenId(terminal)).toBe("dark");
        expect(terminal.pressKey("l")).toBe(true);
        expect(terminal.variable("lights")).toBe(true);
        expect(screenId(terminal)).toBe("dark");
        // now the first rule holds
        expect(terminal.pressKey("l")).toBe(true);
        expect(screenId(terminal)).toBe("vault");
    });

    it("can start a timed rule once they hold", () => {
        const { terminal, ticker } = start("dark");
        terminal.pressKey("l");
        ticker.advance(99);
        expect(screenId(terminal)).toBe("dark");
        ticker.advance(1);
        expect(screenId(terminal)).toBe("hall");
    });
});

describe("bound elements", () => {
    const element = (terminal: Terminal, type: string, index = 0) => {
        const found = terminal.getSnapshot().screen?.run.elements.filter((e) => e.type === type)[
            index
        ];
        if (!found) throw new Error(`No ${type}`);
        return found;
    };

    it("a two-state toggle keeps true or false", () => {
        const { terminal } = start();
        const lights = element(terminal, "toggle");
        expect(terminal.recall(lights.id)).toBe(0);
        terminal.remember(lights.id, 1);
        expect(terminal.variable("lights")).toBe(true);
        expect(texts(terminal)).toContain("[X] LIGHTS");
    });

    it("a longer toggle keeps its state's index, and follows the variable", () => {
        const { terminal } = start();
        const door = element(terminal, "toggle", 1);
        terminal.remember(door.id, 2);
        expect(terminal.variable("door")).toBe(2);
        expect(texts(terminal)).toContain("OPEN");
    });

    it("a slider keeps its value, and follows the variable", () => {
        const { terminal } = start();
        const slider = element(terminal, "slider");
        expect(terminal.recall(slider.id)).toBe(40);
        terminal.remember(slider.id, 70);
        expect(terminal.variable("power")).toBe(70);
        expect(texts(terminal)[0]).toBe("Hello, stranger. Power at 70%.");
        terminal.dispatch(link(terminal, "> BOOST").action);
        expect(terminal.recall(slider.id)).toBe(80);
    });

    it("a prompt keeps what's typed", () => {
        const { terminal } = start("name");
        const prompt = element(terminal, "prompt");
        terminal.remember(prompt.id, "Ada");
        expect(terminal.variable("name")).toBe("Ada");
    });
});

describe("restart", () => {
    it("goes back to the start, with variables and memory as new", () => {
        const { terminal } = start();
        terminal.dispatch(link(terminal, "> BOOST").action);
        const door = terminal.getSnapshot().screen?.run.elements.find((e) => e.type === "toggle");
        if (door) terminal.remember(door.id, 1);
        terminal.navigate("vault");

        terminal.restart();
        expect(screenId(terminal)).toBe("hall");
        expect(terminal.variable("power")).toBe(40);
        expect(terminal.variable("lights")).toBe(false);
        // no transition from the screen that was showing
        expect(terminal.getSnapshot().outgoing).toBeNull();
    });
});

describe("randomness", () => {
    const file = {
        config: {
            name: "Test",
            reveal: "instant" as const,
            variables: { roll: 0, weather: "CLEAR" },
        },
        screens: {
            home: { content: [{ type: "text" as const, pick: ["ONE", "TWO", "THREE"] }] },
            a: { content: ["A"] },
            b: { content: ["B"] },
            c: { content: ["C"] },
        },
    };

    it("rolls numbers and picks values, within their range", () => {
        const { terminal } = createTestTerminal(file, { random: seededRandom(7) });
        terminal.start();
        const rolls = new Set<number>();
        const picks = new Set<unknown>();
        for (let i = 0; i < 200; i++) {
            terminal.dispatch([
                {
                    set: [
                        { variable: "roll", random: [1, 6] },
                        { variable: "weather", pick: ["RAIN", "FOG"] },
                    ],
                },
            ]);
            rolls.add(terminal.variable("roll") as number);
            picks.add(terminal.variable("weather"));
        }
        expect([...rolls].sort()).toEqual([1, 2, 3, 4, 5, 6]);
        expect([...picks].sort()).toEqual(["FOG", "RAIN"]);
    });

    it("goes to one of several screens", () => {
        const { terminal } = createTestTerminal(file, { random: seededRandom(3) });
        terminal.start();
        const seen = new Set<string>();
        for (let i = 0; i < 60; i++) {
            terminal.dispatch([{ screen: ["a", "b", "c"] }]);
            seen.add(terminal.getSnapshot().screen?.run.screen.id ?? "");
        }
        expect([...seen].sort()).toEqual(["a", "b", "c"]);
    });

    it("shows one of a text's lines, chosen each visit and kept for it", () => {
        const { terminal } = createTestTerminal(file, { random: seededRandom(11) });
        const shown = new Set<string>();
        for (let i = 0; i < 30; i++) {
            terminal.navigate("home");
            const run = terminal.getSnapshot().screen?.run;
            const first = run?.text;
            run?.refreshAll();
            expect(run?.text).toBe(first);
            shown.add(first ?? "");
        }
        expect([...shown].sort()).toEqual(["ONE", "THREE", "TWO"]);
    });

    it("checks what's set at random suits the variable", () => {
        const result = parseProgram({
            ...file,
            screens: {
                home: {
                    content: [
                        {
                            type: "link",
                            text: "x",
                            action: {
                                set: { weather: { random: [1, 2] }, roll: { pick: ["A"] } },
                                screen: ["a", "nope"],
                            },
                        },
                    ],
                },
                a: { content: [] },
            },
        });
        expect(result.ok ? [] : result.errors.map((error) => error.message)).toEqual([
            'Unknown screen "nope"',
            '"weather" is text; only numbers can be random numbers',
            '"roll" is a number, so it can\'t be set to "A"',
        ]);
    });
});
