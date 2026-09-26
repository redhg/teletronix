import { describe, expect, it } from "vitest";
import { createTestTerminal } from "../runtime/test-helpers.ts";
import { compactEffects, expandEffects, resolveEffects } from "./effects.ts";
import { parseProgram } from "./program.ts";

const SCANLINES = { opacity: 0.5, moving: true };
const STATIC = { opacity: 0.15, fps: 24, scale: 3 };

describe("resolveEffects", () => {
    it("turns on the default effects with default options", () => {
        expect(resolveEffects()).toEqual({ scanlines: SCANLINES });
    });

    it("turns effects on and off", () => {
        expect(resolveEffects({ scanlines: false, static: true })).toEqual({ static: STATIC });
    });

    it("layers options: defaults, then the program, then the screen", () => {
        expect(
            resolveEffects(
                { scanlines: { opacity: 0.2 }, static: { fps: 10 } },
                { scanlines: { moving: false }, static: true },
            ),
        ).toEqual({
            scanlines: { opacity: 0.2, moving: false },
            static: { ...STATIC, fps: 10 },
        });
    });

    it("lets a screen turn off what the program turned on", () => {
        expect(
            resolveEffects({ static: { fps: 10 } }, { static: false, scanlines: false }),
        ).toEqual({});
    });
});

describe("effects in programs", () => {
    const FILE = {
        config: { name: "Test", effects: { scanlines: { opacity: 0.3 } } },
        screens: {
            calm: { content: ["calm"] },
            noisy: { effects: { static: { opacity: 0.5 } }, content: ["noisy"] },
        },
    };

    it("puts the current screen's effects in the snapshot, the same object each visit", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.navigate("noisy");
        const first = terminal.getSnapshot().effects;
        expect(first).toEqual({
            scanlines: { opacity: 0.3, moving: true },
            static: { ...STATIC, opacity: 0.5 },
        });

        terminal.navigate("calm");
        expect(terminal.getSnapshot().effects).toEqual({
            scanlines: { opacity: 0.3, moving: true },
        });
        terminal.navigate("noisy");
        expect(terminal.getSnapshot().effects).toBe(first);
    });

    it("validates options", () => {
        const result = parseProgram({
            config: { name: "Test", effects: { static: { opacity: 2 }, sparkles: true } },
            screens: { home: { content: ["x"] } },
        });
        expect(result.ok ? [] : result.errors.map((e) => e.path)).toEqual([
            "config.effects.static.opacity",
            "config.effects",
        ]);
    });
});

describe("expandEffects and compactEffects", () => {
    it("round-trip a setting, dropping what matches the defaults", () => {
        const setting = { scanlines: { opacity: 0.2 }, static: true, bloom: false };
        const state = expandEffects(setting);
        expect(state.scanlines).toEqual({ on: true, options: { opacity: 0.2, moving: true } });
        expect(state.bloom.on).toBe(false);
        expect(compactEffects(state)).toEqual({ scanlines: { opacity: 0.2 }, static: true });
    });

    it("writes false only for effects that are on by default", () => {
        const state = expandEffects(undefined);
        state.scanlines.on = false;
        expect(compactEffects(state)).toEqual({ scanlines: false });
        state.scanlines.on = true;
        expect(compactEffects(state)).toBeUndefined();
    });
});
