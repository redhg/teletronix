import { describe, expect, it } from "vitest";
import { createTeletype } from "./teletype.ts";

const texts = (frame: readonly { text: string }[]) => frame.map((s) => s.text);

describe("createTeletype", () => {
    it("lasts one tick per character", () => {
        expect(createTeletype("hello", { speed: 10 }).duration).toBe(50);
        expect(createTeletype("", { speed: 10 }).duration).toBe(0);
    });

    it("splits the text into visible, cursor and hidden", () => {
        const reveal = createTeletype("hello", { speed: 10 });
        expect(texts(reveal.frame(0))).toEqual(["", "h", "ello"]);
        expect(texts(reveal.frame(19))).toEqual(["h", "e", "llo"]);
        expect(texts(reveal.frame(40))).toEqual(["hell", "o", ""]);
        expect(reveal.frame(0).map((s) => s.kind)).toEqual(["visible", "cursor", "hidden"]);
    });

    it("keeps every frame the length of the text", () => {
        const reveal = createTeletype("hello world", { speed: 3 });
        for (let t = 0; t < reveal.duration; t++) {
            expect(texts(reveal.frame(t)).join("")).toBe("hello world");
        }
    });

    it("ends fully visible", () => {
        const reveal = createTeletype("hello", { speed: 10 });
        expect(reveal.final()).toEqual([{ kind: "visible", text: "hello" }]);
        expect(reveal.frame(1000)).toEqual(reveal.final());
    });
});

describe("createTeletype frames", () => {
    it("reuses a frame until the next character appears", () => {
        const reveal = createTeletype("hello", { speed: 10 });
        expect(reveal.frame(11)).toBe(reveal.frame(19));
        expect(reveal.frame(20)).not.toBe(reveal.frame(19));
    });
});
