import { describe, expect, it } from "vitest";
import type { Frame } from "../reveal/types.ts";
import { applyBreaks, lineBreaks } from "./breaks.ts";

const wrap = (text: string, columns: number) =>
    applyBreaks([{ kind: "visible", text }], lineBreaks(text, columns))
        .map((s) => s.text)
        .join("");

describe("lineBreaks", () => {
    it("leaves short text alone", () => {
        expect(lineBreaks("hello", 10)).toEqual([]);
        expect(lineBreaks("hello", 5)).toEqual([]);
    });

    it("breaks at the last space that fits", () => {
        expect(wrap("the quick brown fox", 10)).toBe("the quick\nbrown fox");
        expect(wrap("aaaa bbbb", 4)).toBe("aaaa\nbbbb");
    });

    it("hard-breaks words longer than a line", () => {
        expect(wrap("abcdefghij", 4)).toBe("abcd\nefgh\nij");
        expect(wrap("ab abcdefgh", 4)).toBe("ab\nabcd\nefgh");
    });

    it("respects existing newlines", () => {
        expect(wrap("one two\nthree four", 7)).toBe("one two\nthree\nfour");
        expect(wrap("\n\nabc def", 3)).toBe("\n\nabc\ndef");
    });

    it("ignores unmeasured columns", () => {
        expect(lineBreaks("the quick brown fox", 0)).toEqual([]);
        expect(lineBreaks("the quick brown fox", Number.POSITIVE_INFINITY)).toEqual([]);
    });
});

describe("applyBreaks", () => {
    it("splits breaks across segments without changing their kinds", () => {
        const text = "aaaa bbbb cccc";
        const frame: Frame = [
            { kind: "visible", text: "aaaa " },
            { kind: "cursor", text: "b" },
            { kind: "hidden", text: "bbb cccc" },
        ];
        expect(applyBreaks(frame, lineBreaks(text, 4))).toEqual([
            { kind: "visible", text: "aaaa\n" },
            { kind: "cursor", text: "b" },
            { kind: "hidden", text: "bbb\ncccc" },
        ]);
    });

    it("gives a break at a segment boundary to the segment that starts there", () => {
        const frame: Frame = [
            { kind: "visible", text: "aaaa" },
            { kind: "cursor", text: " " },
            { kind: "hidden", text: "bbbb" },
        ];
        expect(applyBreaks(frame, lineBreaks("aaaa bbbb", 4)).map((s) => s.text)).toEqual([
            "aaaa",
            "\n",
            "bbbb",
        ]);
    });
});
