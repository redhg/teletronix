import { describe, expect, it } from "vitest";
import type { Frame } from "../reveal/types.ts";
import { applyStyles, parseMarkup, styleFrame } from "./markup.ts";

describe("inline markup", () => {
    it("takes the markup out, and says where its styles go", () => {
        expect(parseMarkup("STATUS: [alert]CRITICAL[/alert].")).toEqual({
            text: "STATUS: CRITICAL.",
            styles: [{ start: 8, end: 16, className: "alert" }],
            removed: [
                [8, 15],
                [23, 31],
            ],
        });
        expect(parseMarkup("[alert blink]A[/] B").styles).toEqual([
            { start: 0, end: 1, className: "alert blink" },
        ]);
    });

    it("nests", () => {
        const { text, styles } = parseMarkup("[alert]a[blink]b[/blink]c[/alert]");
        expect(text).toBe("abc");
        expect(styles).toEqual([
            { start: 1, end: 2, className: "blink" },
            { start: 0, end: 3, className: "alert" },
        ]);
    });

    it("shows [[ as a [ that's never markup", () => {
        expect(parseMarkup("Write [[alert]...[[/alert]").text).toBe("Write [alert]...[/alert]");
        expect(parseMarkup("Write [[alert]...[[/alert]").styles).toEqual([]);
        expect(parseMarkup("[[x]] [alert]a[/]")).toMatchObject({
            text: "[x]] a",
            styles: [{ start: 5, end: 6, className: "alert" }],
        });
    });

    it("leaves brackets that aren't markup alone", () => {
        for (const text of [
            "[ OK ]",
            "[FAIL]",
            "[X] DONE",
            "[+] LOGS",
            "[alert] never closed",
            "a [/] b",
        ]) {
            expect(parseMarkup(text)).toEqual({ text, styles: [], removed: [] });
        }
    });

    it("splits a frame where its styles change", () => {
        const frame: Frame = [
            { kind: "visible", text: "abc" },
            { kind: "cursor", text: "d" },
            { kind: "hidden", text: "ef" },
        ];
        expect(applyStyles(frame, [{ start: 1, end: 4, className: "alert" }])).toEqual([
            { kind: "visible", text: "a" },
            { kind: "visible", text: "bc", style: "alert" },
            { kind: "cursor", text: "d", style: "alert" },
            { kind: "hidden", text: "ef" },
        ]);
    });

    it("styles a frame drawn with markup in it, wherever the markup falls", () => {
        const frame: Frame = [
            { kind: "visible", text: "LOG [al" },
            { kind: "hidden", text: "ert][FAIL][/]" },
        ];
        expect(styleFrame(frame)).toEqual([
            { kind: "visible", text: "LOG " },
            { kind: "hidden", text: "[FAIL]", style: "alert" },
        ]);
    });
});
