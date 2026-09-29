import { describe, expect, it } from "vitest";
import type { Frame } from "../reveal/types.ts";
import { createTestTerminal } from "../runtime/test-helpers.ts";
import { applyLayout, layoutText } from "./layout.ts";

const text = (frame: Frame) => frame.map((segment) => segment.text).join("");
const lay = (source: string, columns: number, options: Parameters<typeof layoutText>[2]) =>
    text(applyLayout([{ kind: "visible", text: source }], layoutText(source, columns, options)));

const ART = [" /\\ ", "/  \\", "----"].join("\n");

describe("layout", () => {
    it("leaves left-aligned text as wrapped", () => {
        expect(lay("one two three", 8, {})).toBe("one two\nthree");
    });

    it("centers a block by its widest line, keeping its shape", () => {
        // widest line 4, in 10 columns: every line moves 3 columns, keeping its own spaces
        expect(lay(ART, 10, { align: "center" })).toBe(
            ["    /\\ ", "   /  \\", "   ----"].join("\n"),
        );
        expect(lay("TITLE", 11, { align: "center" })).toBe("   TITLE");
    });

    it("rounds a half column to the left", () => {
        expect(lay("AB", 5, { align: "center" })).toBe(" AB");
    });

    it("right-aligns a block", () => {
        expect(lay("ab\nabcd", 6, { align: "right" })).toBe("  ab\n  abcd");
    });

    it("centers wrapped text by its widest wrapped line", () => {
        expect(lay("one two three", 10, { align: "center" })).toBe(" one two\n three");
    });

    it("keeps lines as written without wrapping, and doesn't indent a block too wide", () => {
        expect(lay("a very long line", 6, { wrap: false })).toBe("a very long line");
        expect(lay("a very long line", 6, { wrap: false, align: "center" })).toBe(
            "a very long line",
        );
    });

    it("never puts the indent inside the typing cursor", () => {
        const layout = layoutText("ab\ncd", 6, { align: "center" });
        // the cursor on the first character of the second line
        const frame = applyLayout(
            [
                { kind: "visible", text: "ab\n" },
                { kind: "cursor", text: "c" },
                { kind: "hidden", text: "d" },
            ],
            layout,
        );
        expect(frame).toEqual([
            { kind: "visible", text: "  ab\n  " },
            { kind: "cursor", text: "c" },
            { kind: "hidden", text: "d" },
        ]);
        // and on a line break, the next line's indent goes after it
        expect(
            applyLayout(
                [
                    { kind: "visible", text: "ab" },
                    { kind: "cursor", text: "\n" },
                    { kind: "hidden", text: "cd" },
                ],
                layout,
            ),
        ).toEqual([
            { kind: "visible", text: "  ab" },
            { kind: "cursor", text: "\n" },
            { kind: "hidden", text: "  cd" },
        ]);
    });
});

describe("aligned elements", () => {
    const texts = (align?: "center" | "right", screenAlign?: "center") => {
        const { terminal } = createTestTerminal(
            {
                config: { name: "Test" },
                screens: {
                    home: {
                        align: screenAlign,
                        content: [
                            { type: "text", text: "HI", align },
                            { type: "text", text: ["+--+", "|  |", "+--+"], wrap: false },
                            { type: "progress", label: "P ", duration: 1 },
                        ],
                    },
                },
            },
            { instant: true, columns: 10 },
        );
        terminal.start();
        const run = terminal.getSnapshot().screen?.run;
        return [0, 1, 2].map((index) => {
            let drawn = "";
            run?.subscribeFrame(index, (frame) => {
                drawn = text(frame);
            })();
            return drawn;
        });
    };

    it("follow their own align", () => {
        expect(texts("center")[0]).toBe("    HI");
        expect(texts("right")[0]).toBe("        HI");
    });

    it("follow the screen's align, except elements that can't be aligned", () => {
        const [hi, box, progress] = texts(undefined, "center");
        expect(hi).toBe("    HI");
        expect(box).toBe("   +--+\n   |  |\n   +--+");
        expect(progress?.startsWith("P ")).toBe(true);
    });

    it("take text as a list of lines", () => {
        expect(texts()[1]).toBe("+--+\n|  |\n+--+");
    });
});
