import { describe, expect, it } from "vitest";
import { parseProgram } from "../../engine/schema/program.ts";
import { matchCommand, type PromptElement } from "./definition.ts";

function parsePrompt(prompt: object): PromptElement {
    const result = parseProgram({
        config: { name: "Test", variables: { open: false } },
        screens: {
            home: { content: [{ type: "prompt", ...prompt }] },
            next: { content: ["x"] },
        },
        dialogs: { help: { type: "alert", content: ["Help"] } },
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.program.screens.get("home")?.content[0] as PromptElement;
}

describe("prompt", () => {
    const prompt = parsePrompt({
        commands: [
            { command: "next", action: { screen: "next" } },
            { command: ["help", "?", "show  manual"], action: { dialog: "help" } },
        ],
    });

    it("fills in defaults", () => {
        expect(prompt.prompt).toBe("> ");
        expect(prompt.unknown).toBe("Unknown command.");
    });

    it("matches commands case-insensitively, ignoring extra whitespace", () => {
        expect(matchCommand(prompt, "NEXT")).toEqual([{ screen: "next" }]);
        expect(matchCommand(prompt, "  next ")).toEqual([{ screen: "next" }]);
        expect(matchCommand(prompt, "Show   Manual")).toEqual([{ dialog: "help" }]);
    });

    it("matches aliases", () => {
        expect(matchCommand(prompt, "?")).toEqual([{ dialog: "help" }]);
    });

    it("returns null for unknown or empty input", () => {
        expect(matchCommand(prompt, "nope")).toBeNull();
        expect(matchCommand(prompt, "   ")).toBeNull();
    });

    it("skips commands whose condition doesn't hold", () => {
        const guarded = parsePrompt({
            commands: [{ command: "next", if: { open: true }, action: { screen: "next" } }],
        });
        expect(matchCommand(guarded, "next", () => false)).toBeNull();
        expect(matchCommand(guarded, "next", () => true)).toEqual([{ screen: "next" }]);
    });

    it("falls back to onEnter for anything else", () => {
        const named = parsePrompt({
            commands: [{ command: "help", action: { dialog: "help" } }],
            onEnter: { screen: "next" },
        });
        expect(matchCommand(named, "help")).toEqual([{ dialog: "help" }]);
        expect(matchCommand(named, "Ada Lovelace")).toEqual([{ screen: "next" }]);
        expect(matchCommand(named, "  ")).toBeNull();
    });

    it("validates command targets", () => {
        const result = parseProgram({
            config: { name: "Test" },
            screens: {
                home: {
                    content: [
                        {
                            type: "prompt",
                            commands: [{ command: "go", action: { screen: "missing" } }],
                        },
                    ],
                },
            },
        });
        expect(result.ok ? [] : result.errors).toEqual([
            { path: "screens.home.content[0]", message: 'Unknown screen "missing"' },
        ]);
    });
});
