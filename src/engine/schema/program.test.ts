import { describe, expect, it } from "vitest";
import { parseProgram, type TeletronixFile } from "./program.ts";

const file = (overrides: Partial<TeletronixFile> = {}): TeletronixFile => ({
    config: { name: "Test" },
    screens: {
        home: {
            content: ["Hello", { type: "link", text: "> NEXT", action: { screen: "next" } }],
        },
        next: { content: ["Bye"] },
    },
    ...overrides,
});

const errors = (input: unknown) => {
    const result = parseProgram(input);
    if (result.ok) throw new Error("expected the program to be invalid");
    return result.errors;
};

describe("parseProgram", () => {
    it("normalizes a valid program", () => {
        const result = parseProgram(file());
        if (!result.ok) throw new Error(JSON.stringify(result.errors));

        const { program } = result;
        expect(program.start).toBe("home");
        expect(program.defaults).toEqual({
            reveal: { type: "teletype" },
            transition: { type: "none" },
            teletype: { speed: 10 },
            glitch: { duration: 1000 },
        });
        expect(program.screens.get("home")?.content).toEqual([
            { id: "home#0", type: "text", text: "Hello" },
            {
                id: "home#1",
                type: "link",
                text: "> NEXT",
                action: { type: "screen", target: "next" },
            },
        ]);
    });

    it("normalizes reveal and transition shorthand", () => {
        const result = parseProgram(
            file({
                config: {
                    name: "Test",
                    reveal: "instant",
                    transition: "glitch",
                    defaults: { teletype: { speed: 3 }, glitch: { duration: 500 } },
                },
                screens: {
                    home: {
                        reveal: "teletype",
                        transition: { type: "glitch", duration: 200 },
                        content: ["a"],
                    },
                },
            }),
        );
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        expect(result.program.defaults).toEqual({
            reveal: { type: "instant" },
            transition: { type: "glitch" },
            teletype: { speed: 3 },
            glitch: { duration: 500 },
        });
        const home = result.program.screens.get("home");
        expect(home?.reveal).toEqual({ type: "teletype" });
        expect(home?.transition).toEqual({ type: "glitch", duration: 200 });
    });

    it("turns autoscroll on unless the config or a screen turns it off", () => {
        const on = parseProgram(file());
        expect(on.ok && on.program.autoscroll).toBe(true);

        const off = parseProgram(
            file({
                config: { name: "Test", autoscroll: false },
                screens: { home: { autoscroll: true, content: ["x"] } },
            }),
        );
        if (!off.ok) throw new Error(JSON.stringify(off.errors));
        expect(off.program.autoscroll).toBe(false);
        expect(off.program.screens.get("home")?.autoscroll).toBe(true);
    });

    it("honors an explicit start screen", () => {
        const result = parseProgram(file({ config: { name: "Test", start: "next" } }));
        expect(result.ok && result.program.start).toBe("next");
    });

    it("reports links to unknown screens and dialogs with their path", () => {
        const input = file({
            screens: {
                home: {
                    content: [
                        "Hello",
                        {
                            type: "link",
                            text: "> GO",
                            action: { screen: "nowhere" },
                            shiftAction: { dialog: "missing" },
                        },
                    ],
                },
            },
        });
        expect(errors(input)).toEqual([
            { path: "screens.home.content[1]", message: 'Unknown screen "nowhere"' },
            { path: "screens.home.content[1]", message: 'Unknown dialog "missing"' },
        ]);
    });

    it("reports an unknown start screen", () => {
        expect(errors(file({ config: { name: "Test", start: "nope" } }))).toEqual([
            { path: "config.start", message: 'Unknown start screen "nope"' },
        ]);
    });

    it("requires at least one screen", () => {
        expect(errors(file({ screens: {} }))).toEqual([
            { path: "screens", message: "Add at least one screen" },
        ]);
    });

    it("rejects unknown fields and malformed elements", () => {
        const input = file({
            screens: {
                home: {
                    content: [{ type: "link", text: "x", action: { screen: "a", dialog: "b" } }],
                },
            },
        });
        expect(errors(input)).toEqual([
            { path: "screens.home.content[0].action", message: 'Unrecognized key: "dialog"' },
        ]);
        expect(errors({ ...file(), extra: true })[0]?.message).toMatch(/extra/);
    });

    it("explains the closest shape when a value matches none of its shapes", () => {
        const input = file({
            screens: { home: { content: ["ok", { type: "link", text: "> GO" }, { type: "lnk" }] } },
        } as Partial<TeletronixFile>);
        expect(errors(input)).toEqual([
            {
                path: "screens.home.content[1].action",
                message: "Invalid input: expected object, received undefined",
            },
            {
                path: "screens.home.content[2].type",
                message:
                    "Invalid discriminator value. Expected 'text' | 'link' | 'toggle' | 'prompt' | 'bitmap' | 'progress'",
            },
        ]);
    });

    it("quotes ids that aren't identifiers in paths", () => {
        const input = { ...file(), screens: { "screen-1": { content: [{ type: "text" }] } } };
        expect(errors(input)[0]?.path).toMatch(/^screens\["screen-1"\]\.content\[0\]/);
    });
});
