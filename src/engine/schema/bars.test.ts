import { describe, expect, it } from "vitest";
import { type BarLine, BarLineSchema, layoutBarLine } from "./bars.ts";
import { parseProgram } from "./program.ts";

const line = (input: unknown) => BarLineSchema.parse(input) as BarLine;
const drawn = (input: unknown, columns: number, format = (text: string) => text) =>
    layoutBarLine(line(input), columns, format)
        .map((piece) => piece.text)
        .join("");

describe("bar lines", () => {
    it("spread left, center and right across the columns", () => {
        expect(drawn({ left: "L", center: "MID", right: "R" }, 11)).toBe("L   MID   R");
        expect(drawn("JUST TEXT", 12)).toBe("JUST TEXT   ");
    });

    it("keep the left, then the right, where they'd overlap", () => {
        expect(drawn({ left: "LEFTSIDE", right: "RIGHT", center: "C" }, 10)).toBe("LEFTSIDEHT");
    });

    it("fill in variables", () => {
        expect(drawn({ right: "{n} CR" }, 8, (text) => text.replace("{n}", "12"))).toBe("   12 CR");
    });

    it("mark which pieces are which slot, for links", () => {
        const pieces = layoutBarLine(
            line({ left: "A", right: { text: "HELP", action: { dialog: "d" } } }),
            8,
            (text) => text,
        );
        expect(pieces).toEqual([
            { text: "A", slot: "left" },
            { text: "   " },
            { text: "HELP", slot: "right" },
        ]);
    });
});

describe("bar links", () => {
    it("are checked when the program loads", () => {
        const result = parseProgram({
            config: {
                name: "T",
                footer: [{ right: { text: "HELP", action: { dialog: "nope" } } }],
            },
            screens: {
                home: {
                    header: [{ left: { text: "X", action: { screen: "gone" } } }],
                    content: [],
                },
            },
        });
        expect(result.ok ? [] : result.errors).toEqual([
            { path: "config.footer[0].right.action", message: 'Unknown dialog "nope"' },
            { path: "screens.home.header[0].left.action", message: 'Unknown screen "gone"' },
        ]);
    });
});
