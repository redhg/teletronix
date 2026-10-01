import { describe, expect, it } from "vitest";
import { createTestTerminal } from "../runtime/test-helpers.ts";
import { resolveTheme, THEMES } from "./appearance.ts";
import { parseProgram } from "./program.ts";

const parse = (config: object) =>
    parseProgram({ config: { name: "Test", ...config }, screens: { home: { content: ["x"] } } });

describe("appearance", () => {
    it("defaults to the default theme and Departure Mono, at 0.75", () => {
        const result = parse({});
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        expect(result.program.palette).toEqual(THEMES.default);
        expect(result.program.font).toBe("departure-mono");
        expect(result.program.fontScale).toBe(0.75);
    });

    it("takes a named theme, or custom colors with a default alert color", () => {
        expect(resolveTheme("amber")).toEqual(THEMES.amber);
        expect(resolveTheme({ fg: "#33ff66", bg: "#001100" })).toEqual({
            fg: "#33ff66",
            bg: "#001100",
            alert: "#ff3c00",
        });
    });

    it("rejects unknown fonts and malformed colors", () => {
        const result = parse({ font: "comic-sans", theme: { fg: "green", bg: "#000000" } });
        expect(result.ok ? [] : result.errors.map((e) => e.path)).toEqual([
            "config.theme.fg",
            "config.font",
        ]);
    });
});

describe("Terminal.setEffects", () => {
    it("replaces the program-wide effects and republishes them", () => {
        const { terminal } = createTestTerminal({
            config: { name: "Test" },
            screens: { home: { effects: { static: true }, content: ["x"] } },
        });
        terminal.start();
        expect(Object.keys(terminal.getSnapshot().effects)).toEqual(["scanlines", "static"]);
        terminal.setEffects({ scanlines: false, bloom: true });
        // the screen's own static stays on
        expect(Object.keys(terminal.getSnapshot().effects)).toEqual(["static", "bloom"]);
    });
});
