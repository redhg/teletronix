import { describe, expect, it } from "vitest";
import { mapText } from "./character-map.ts";

describe("the character map", () => {
    const map = new Map([
        ["<", "("],
        ["(", "<"],
        ["█", "#"],
    ]);

    it("swaps each mapped character for one, leaving the rest", () => {
        expect(mapText("<OK> (1) ███", map)).toBe("(OK> <1) ###");
        // a text without any comes back as it was
        const text = "NOTHING TO SWAP";
        expect(mapText(text, map)).toBe(text);
    });

    it("keeps characters beyond the basic plane whole", () => {
        expect(mapText("😀<", map)).toBe("😀(");
        expect(mapText("a", new Map([["a", "😀"]]))).toBe("😀");
    });
});
