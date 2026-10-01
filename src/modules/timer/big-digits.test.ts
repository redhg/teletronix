import { describe, expect, it } from "vitest";
import { bigDigits, bigWidth } from "./big-digits.ts";

describe("big digits", () => {
    it("draw a time five lines tall, in block characters", () => {
        expect(bigDigits("1:0")).toEqual([
            "  ██        ██████",
            "████    ██  ██  ██",
            "  ██        ██  ██",
            "  ██    ██  ██  ██",
            "██████      ██████",
        ]);
    });

    it("say how wide they are", () => {
        // two 6-wide digits, a 2-wide colon, and gaps of 2 between them
        expect(bigWidth("1:0")).toBe(18);
        expect(bigWidth("01:30")).toBe(6 * 4 + 2 + 2 * 4);
    });
});
