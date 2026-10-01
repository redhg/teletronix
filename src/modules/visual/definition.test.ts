import { describe, expect, it } from "vitest";
import { levelOf, type VisualElement } from "./definition.ts";

const visual = (level?: VisualElement["level"]) =>
    ({ id: "x", type: "visual", kind: "waveform", level }) as VisualElement;

describe("a visual's level", () => {
    it("is where its variable is between min and max, from 0 to 1", () => {
        expect(levelOf(visual({ variable: "fuel", min: 0, max: 100 }), 25)).toBe(0.25);
        expect(levelOf(visual({ variable: "fuel", min: 50, max: 150 }), 200)).toBe(1);
        expect(levelOf(visual({ variable: "fuel", min: 0, max: 100 }), -5)).toBe(0);
    });

    it("is nothing without one, or for a variable that isn't a number", () => {
        expect(levelOf(visual(), 25)).toBeNull();
        expect(levelOf(visual({ variable: "fuel", min: 0, max: 100 }), "high")).toBeNull();
    });
});
