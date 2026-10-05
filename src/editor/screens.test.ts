import { describe, expect, it } from "vitest";
import { parseProgram } from "../engine/index.ts";
import type { ProgramFile } from "./EditorApp.tsx";
import {
    ELEMENT_TYPES,
    freeId,
    insertScreen,
    renameScreen,
    renameVariable,
    summarize,
} from "./screens.ts";

const file: ProgramFile = {
    config: {
        name: "T",
        start: "home",
        timers: { clock: { from: 9, onComplete: { screen: "home" } } },
    },
    screens: {
        home: {
            content: [
                { type: "link", text: "> GO", action: { screen: "home" } },
                { type: "link", text: "> ONE", action: { screen: ["home", "other"] } },
                {
                    type: "conversation",
                    start: "home",
                    nodes: { home: { say: "HI", replies: [{ text: "BYE", next: "home" }] } },
                },
            ],
        },
        other: { parent: "home", content: [] },
        locked: {
            preset: {
                type: "login",
                accounts: [{ user: "ash", password: "x" }],
                attempts: 3,
                next: "home",
                lockout: "home",
            },
        },
    },
};

describe("screens in the editor", () => {
    it("rename a screen, and everything that names it", () => {
        const renamed = renameScreen(file, "home", "lobby");
        expect(Object.keys(renamed.screens as object)).toEqual(["lobby", "other", "locked"]);
        expect(renamed).toMatchObject({
            config: { start: "lobby", timers: { clock: { onComplete: { screen: "lobby" } } } },
            screens: {
                lobby: {
                    content: [
                        { action: { screen: "lobby" } },
                        { action: { screen: ["lobby", "other"] } },
                        // (a conversation's parts are its own: not screens)
                        { start: "home", nodes: { home: { replies: [{ next: "home" }] } } },
                    ],
                },
                other: { parent: "lobby" },
                locked: { preset: { next: "lobby", lockout: "lobby" } },
            },
        });
        // the original is untouched
        expect((file.config as { start: string }).start).toBe("home");
    });

    it("add a screen after another, with an id that isn't taken", () => {
        const added = insertScreen(
            file,
            freeId(["home", "home-2"], "home"),
            { content: [] },
            "home",
        );
        expect(Object.keys(added.screens as object)).toEqual(["home", "home-3", "other", "locked"]);
    });

    it("know every element type, and sum one up in a line", () => {
        const types = ELEMENT_TYPES.map((entry) => entry.type);
        expect(types).toContain("text");
        expect(types).toContain("tree");
        expect(ELEMENT_TYPES.every((entry) => entry.description !== "")).toBe(true);
        expect(summarize("A LINE")).toBe("A LINE");
        expect(summarize({ type: "link", text: "> GO" })).toBe("> GO");
        expect(summarize({ type: "menu", items: [{}, {}] })).toBe("2 items");
    });

    it("leave a renamed program valid", () => {
        const result = parseProgram({
            config: { name: "T", start: "home" },
            screens: {
                home: { content: [{ type: "link", text: "x", action: { screen: "home" } }] },
            },
        });
        expect(result.ok).toBe(true);
        const after = parseProgram(renameScreen(file, "home", "lobby"));
        expect(after.ok ? [] : after.errors).toEqual([]);
    });
});

describe("renaming a variable", () => {
    const problems = (renamed: ProgramFile) => {
        const result = parseProgram(renamed);
        return result.ok ? [] : result.errors;
    };
    const contentOf = (renamed: ProgramFile) =>
        (renamed.screens as Record<string, { content: unknown[] }>).home?.content ?? [];
    const program: ProgramFile = {
        config: {
            name: "T",
            start: "home",
            variables: { first: 1, power: 0, last: "{power}", lit: false },
            timers: { power2: { from: 9, onComplete: { set: { power: 0 } } } },
        },
        screens: {
            home: {
                content: [
                    "POWER: {power}%. {powerful} {power2}",
                    {
                        type: "link",
                        text: "> UP",
                        action: { set: { first: 2, power: { add: 10 } }, startTimer: "power2" },
                        if: { any: [{ power: { atLeast: 5 } }, { not: { first: 1 } }] },
                    },
                    { type: "slider", variable: "power", label: "power" },
                    {
                        type: "choice",
                        multiple: true,
                        options: ["A", "B"],
                        variables: [null, "lit"],
                    },
                    { type: "timer", timer: "power2" },
                    { type: "map", markers: [{ x: "power", y: 0 }] },
                ],
            },
        },
    };

    it("renames it everywhere it's named, and nothing else", () => {
        const renamed = renameVariable(program, "power", "charge");
        const config = renamed.config as Record<string, Record<string, unknown>>;
        // it keeps its place, and its starting value isn't text to rewrite
        expect(Object.keys(config.variables ?? {})).toEqual(["first", "charge", "last", "lit"]);
        expect(config.variables?.last).toBe("{power}");
        expect(config.timers).toEqual({ power2: { from: 9, onComplete: { set: { charge: 0 } } } });
        const [text, link, slider, choice] = contentOf(renamed) as Record<string, unknown>[];
        expect(text).toBe("POWER: {charge}%. {powerful} {power2}");
        expect(link).toMatchObject({
            action: { set: { first: 2, charge: { add: 10 } }, startTimer: "power2" },
            if: { any: [{ charge: { atLeast: 5 } }, { not: { first: 1 } }] },
        });
        expect(slider).toMatchObject({ variable: "charge", label: "power" });
        expect(choice?.variables).toEqual([null, "lit"]);
        expect(problems(renamed)).toEqual([]);
    });

    it("renames a timer, and the actions and elements that use it", () => {
        const renamed = renameVariable(program, "power2", "countdown");
        const config = renamed.config as Record<string, Record<string, unknown>>;
        expect(Object.keys(config.timers ?? {})).toEqual(["countdown"]);
        const content = contentOf(renamed);
        expect(content[0]).toBe("POWER: {power}%. {powerful} {countdown}");
        expect(content[1]).toMatchObject({ action: { startTimer: "countdown" } });
        expect(content[4]).toEqual({ type: "timer", timer: "countdown" });
        expect(content[5]).toMatchObject({ markers: [{ x: "power", y: 0 }] });
    });

    it("renames a choice's variables", () => {
        const renamed = renameVariable(program, "lit", "on");
        const content = contentOf(renamed);
        expect(content[3]).toMatchObject({ variables: [null, "on"] });
        expect(problems(renamed)).toEqual([]);
    });
});
