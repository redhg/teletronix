import { describe, expect, it } from "vitest";
import { THEMES } from "../engine/index.ts";
import { accentFor } from "./theme.ts";

describe("the GM panel's accent", () => {
    it("matches the program's colours", () => {
        expect(accentFor(THEMES.amber.fg)).toBe("orange");
        expect(accentFor(THEMES.green.fg)).toBe("green");
        expect(accentFor(THEMES.default.fg)).toBe("cyan");
        expect(accentFor("#ff0000")).toBe("red");
    });

    it("is blue for greys, or a colour it can't read", () => {
        expect(accentFor(THEMES.white.fg)).toBe("blue");
        expect(accentFor("rebeccapurple")).toBe("blue");
    });
});
