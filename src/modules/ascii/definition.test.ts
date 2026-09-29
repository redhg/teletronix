import { describe, expect, it } from "vitest";
import { LOAD_FAILED } from "../../engine/module.ts";
import { type AsciiElement, asciiModule } from "./definition.ts";

const element = { id: "a", type: "ascii", src: "x.png", alt: "A PICTURE" } as AsciiElement;

describe("ascii", () => {
    it("shows the converted picture once it's ready, and nothing before", () => {
        expect(asciiModule.text(element, undefined, undefined, undefined)).toBe("");
        expect(asciiModule.text(element, undefined, undefined, " /\\\n/__\\")).toBe(" /\\\n/__\\");
    });

    it("says so when the picture can't be had", () => {
        expect(asciiModule.text(element, undefined, undefined, LOAD_FAILED)).toBe(
            "[IMAGE UNAVAILABLE: A PICTURE]",
        );
    });
});
