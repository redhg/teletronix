import { describe, expect, it } from "vitest";
import { type PowerOffElement, powerOffModule } from "./definition.ts";

const element: PowerOffElement = { id: "x", type: "power-off", delay: 500, duration: 900 };
const context = (instant: boolean) => ({ columns: () => 80, memory: () => undefined, instant });

describe("power-off", () => {
    it("takes its delay and its collapse to finish, with no text", () => {
        const reveal = powerOffModule.reveal?.(element, { type: "instant" }, context(false));
        expect(reveal?.duration).toBe(1400);
        expect(powerOffModule.text(element, undefined)).toBe("");
    });

    it("is off at once when everything shows at once", () => {
        const reveal = powerOffModule.reveal?.(element, { type: "instant" }, context(true));
        expect(reveal?.duration).toBe(0);
    });
});
