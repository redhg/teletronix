import { describe, expect, it } from "vitest";
import { parseProgram } from "../engine/index.ts";
import type { ProgramFile } from "./EditorApp.tsx";
import { ELEMENT_TYPES, freeId, insertScreen, renameScreen, summarize } from "./screens.ts";

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
