import { describe, expect, it } from "vitest";
import { createTestTerminal } from "../runtime/test-helpers.ts";
import { DEFAULT_VOICES } from "../sound/voices.ts";
import { type Cue, compactSound, resolveSound, SoundSchema } from "./sound.ts";

describe("sound setting", () => {
    it("is on and quiet by default, without the hum", () => {
        expect(resolveSound(undefined)).toEqual({
            volume: 0.3,
            button: true,
            typing: true,
            glitch: true,
            static: true,
            interface: true,
            hum: false,
            ambience: true,
            voices: DEFAULT_VOICES,
        });
        expect(resolveSound(false)).toBeNull();
    });

    it("lays a program's voice overrides over the defaults", () => {
        const sound = resolveSound({ voices: { key: { pitch: 2400 }, select: { wave: "sine" } } });
        expect(sound?.voices.key).toEqual({ ...DEFAULT_VOICES.key, pitch: 2400 });
        expect(sound?.voices.select.wave).toBe("sine");
        expect(sound?.voices.dialog).toEqual(DEFAULT_VOICES.dialog);
        expect(compactSound(sound)).toEqual({
            voices: { key: { pitch: 2400 }, select: { wave: "sine" } },
        });
    });

    it("rejects voice settings out of range or unknown", () => {
        expect(SoundSchema.safeParse({ voices: { key: { pitch: 99999 } } }).success).toBe(false);
        expect(SoundSchema.safeParse({ voices: { key: { sparkle: 1 } } }).success).toBe(false);
        expect(SoundSchema.safeParse({ voices: { select: { wave: "noise" } } }).success).toBe(
            false,
        );
    });

    it("compacts back to what differs from the defaults", () => {
        const sound = resolveSound({ volume: 0.5, hum: true });
        expect(compactSound(sound)).toEqual({ volume: 0.5, hum: true });
        expect(compactSound(resolveSound({ button: false }))).toEqual({ button: false });
        expect(compactSound(resolveSound(true))).toBeUndefined();
        expect(compactSound(null)).toBe(false);
    });
});

const FILE = {
    config: { name: "Test", defaults: { teletype: { speed: 10 }, glitch: { duration: 100 } } },
    screens: {
        typed: { content: ["abc"] },
        glitched: { reveal: "glitch" as const, transition: "glitch" as const, content: ["x"] },
        tuned: { transition: "static" as const, content: [] },
    },
    dialogs: {
        note: { type: "alert" as const, content: "!" },
        warn: { type: "alert" as const, className: "alert", content: "!!" },
    },
};

describe("cues", () => {
    const setup = () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        const cues: Cue[] = [];
        terminal.subscribeCues((cue) => cues.push(cue));
        return { terminal, ticker, cues };
    };

    it("sends a key for each character typed", () => {
        const { terminal, ticker, cues } = setup();
        terminal.navigate("typed");
        ticker.advance(30, 5);
        expect(cues).toEqual([{ type: "key" }, { type: "key" }, { type: "key" }]);
    });

    it("sends nothing for text that's skipped", () => {
        const { terminal, cues } = setup();
        terminal.navigate("typed");
        cues.length = 0;
        terminal.skip();
        expect(cues).toEqual([]);
    });

    it("sends glitches for glitch reveals and transitions, with their durations", () => {
        const { terminal, ticker, cues } = setup();
        terminal.navigate("typed");
        ticker.advance(100);
        cues.length = 0;
        terminal.navigate("glitched");
        // the old screen erasing, and the new one revealing
        expect(cues).toEqual([
            { type: "glitch", duration: 100 },
            { type: "glitch", duration: 100 },
        ]);
    });

    it("sends static for the static transition", () => {
        const { terminal, cues } = setup();
        terminal.navigate("typed");
        cues.length = 0;
        terminal.navigate("tuned");
        expect(cues).toEqual([{ type: "static", duration: 120 }]);
    });

    it("sends dialogs, marking alert-styled ones", () => {
        const { terminal, cues } = setup();
        terminal.navigate("typed");
        cues.length = 0;
        terminal.openDialog("note");
        terminal.answerDialog(true);
        terminal.openDialog("warn");
        expect(cues).toEqual([
            { type: "dialog", alert: false },
            { type: "dialog", alert: true },
        ]);
    });
});
