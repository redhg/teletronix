import { describe, expect, it } from "vitest";
import { resolveSettings, step, stepTextSize } from "./settings.ts";

const device = { reducedMotion: false, moreContrast: false, dark: true };

describe("a player's settings", () => {
    it("follows the program, unless the player or the device says otherwise", () => {
        expect(resolveSettings({}, device)).toEqual({
            look: "program",
            textSize: 1,
            effects: true,
            instant: false,
            volume: undefined,
        });
        expect(resolveSettings({ textSize: 1.5, volume: 0.2 }, device)).toMatchObject({
            textSize: 1.5,
            volume: 0.2,
        });
    });

    it("takes reduced motion and more contrast from the device", () => {
        expect(resolveSettings({}, { ...device, reducedMotion: true })).toMatchObject({
            effects: true,
            instant: true,
        });
        expect(resolveSettings({}, { ...device, moreContrast: true }).look).toBe("contrast-dark");
        expect(resolveSettings({}, { ...device, moreContrast: true, dark: false }).look).toBe(
            "contrast-light",
        );
        // the player's own choice wins
        expect(
            resolveSettings(
                { look: "program", effects: true },
                { ...device, moreContrast: true, reducedMotion: true },
            ),
        ).toMatchObject({ look: "program", effects: true, instant: true });
    });

    it("steps through choices, wrapping, and text sizes, stopping at the ends", () => {
        expect(step(["a", "b", "c"], "c", 1)).toBe("a");
        expect(step(["a", "b", "c"], "a", -1)).toBe("c");
        expect(stepTextSize(1, 1)).toBe(1.25);
        expect(stepTextSize(1, -1)).toBe(0.875);
        expect(stepTextSize(2, 1)).toBe(2);
        expect(stepTextSize(0.75, -1)).toBe(0.75);
    });
});
