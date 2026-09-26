import { describe, expect, it } from "vitest";
import type { TeletronixFile } from "../schema/program.ts";
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
