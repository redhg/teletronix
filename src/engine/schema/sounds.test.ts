import { describe, expect, it } from "vitest";
import { createTestTerminal } from "../runtime/test-helpers.ts";
import { parseProgram, type TeletronixFile } from "./program.ts";
import type { Cue } from "./sound.ts";

const FILE: TeletronixFile = {
    config: { name: "Test", reveal: "instant" },
    sounds: {
        door: { wave: "noise", decay: 0.3 },
        alarm: { wave: "sawtooth", vibratoDepth: 0.5 },
        beep: {},
    },
    screens: {
        home: {
            sound: "door",
            content: [
                "Welcome.",
                { type: "text", text: "WARNING", sound: "alarm" },
                { type: "link", text: "> GO", action: { screen: "away", sound: "beep" } },
            ],
        },
        away: { content: ["Away."] },
    },
    dialogs: { warn: { type: "alert", content: "!", sound: "alarm" } },
};

describe("the sounds library", () => {
    it("fills in each recipe", () => {
        const result = parseProgram(FILE);
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        expect(result.program.sounds.get("door")).toMatchObject({
            wave: "noise",
            decay: 0.3,
            sustain: 0.3,
        });
        expect(result.program.sounds.get("beep")?.wave).toBe("square");
    });

    it("reports sounds that aren't in the library, wherever they're used", () => {
        const result = parseProgram({
            ...FILE,
            screens: {
                home: {
                    sound: "nope1",
                    content: [
                        { type: "text", text: "x", sound: "nope2" },
                        { type: "link", text: "> GO", action: { screen: "home", sound: "nope3" } },
                    ],
                },
            },
            dialogs: { warn: { type: "alert", content: "!", sound: "nope4" } },
        });
        expect(result.ok ? [] : result.errors).toEqual([
            { path: "dialogs.warn.sound", message: 'Unknown sound "nope4"' },
            { path: "screens.home.sound", message: 'Unknown sound "nope1"' },
            { path: "screens.home.content[0].sound", message: 'Unknown sound "nope2"' },
            { path: "screens.home.content[1]", message: 'Unknown sound "nope3"' },
        ]);
    });

    it("rejects recipes with settings out of range", () => {
        const result = parseProgram({ ...FILE, sounds: { bad: { slide: 3 } } });
        expect(result.ok ? [] : result.errors.map((e) => e.path)).toContain("sounds.bad.slide");
    });
});

describe("sound cues", () => {
    const setup = () => {
        const { terminal } = createTestTerminal(FILE);
        const cues: Cue[] = [];
        terminal.subscribeCues((cue) => cues.push(cue));
        return { terminal, cues };
    };

    it("plays a screen's sound as it appears, and an element's as it starts", () => {
        const { terminal, cues } = setup();
        terminal.navigate("home");
        expect(cues).toEqual([
            { type: "sound", name: "door" },
            { type: "sound", name: "alarm" },
        ]);
    });

    it("plays an action's sound as it happens", () => {
        const { terminal, cues } = setup();
        terminal.navigate("home");
        cues.length = 0;
        terminal.dispatch({ type: "screen", target: "away", sound: "beep" });
        expect(cues).toEqual([{ type: "sound", name: "beep" }]);
    });

    it("plays a dialog's own sound instead of the usual beep", () => {
        const { terminal, cues } = setup();
        terminal.navigate("home");
        cues.length = 0;
        terminal.openDialog("warn");
        expect(cues).toEqual([{ type: "sound", name: "alarm" }]);
    });
});
