import { describe, expect, it } from "vitest";
import { parseProgram } from "../../engine/schema/program.ts";
import { matchCommand, type PromptElement } from "./definition.ts";

function parsePrompt(prompt: object): PromptElement {
    const result = parseProgram({
        config: { name: "Test" },
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
        expect(matchCommand(prompt, "NEXT")).toEqual({ type: "screen", target: "next" });
        expect(matchCommand(prompt, "  next ")).toEqual({ type: "screen", target: "next" });
        expect(matchCommand(prompt, "Show   Manual")).toEqual({ type: "dialog", target: "help" });
    });

    it("matches aliases", () => {
        expect(matchCommand(prompt, "?")).toEqual({ type: "dialog", target: "help" });
    });

    it("returns null for unknown or empty input", () => {
        expect(matchCommand(prompt, "nope")).toBeNull();
        expect(matchCommand(prompt, "   ")).toBeNull();
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
