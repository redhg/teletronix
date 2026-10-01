import { describe, expect, it } from "vitest";
import { type BarLine, BarLineSchema, layoutBarLine } from "./bars.ts";
import { ActionSchema } from "./common.ts";
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

describe("bar breadcrumbs", () => {
    const go = (screen: string) => ActionSchema.parse({ screen });
    const trail = [
        { text: "HOME", action: go("home") },
        { text: "READOUTS", action: go("readouts") },
        { text: "SPINNERS" },
    ];
    const crumbs = (input: unknown, columns: number) =>
        layoutBarLine(line(input), columns, (text) => text, trail);

    it("show the trail, each step a link but the last", () => {
        expect(crumbs({ left: { breadcrumb: true } }, 28)).toEqual([
            { text: "HOME", slot: "left", action: go("home") },
            { text: " › ", slot: "left" },
            { text: "READOUTS", slot: "left", action: go("readouts") },
            { text: " › SPINNERS", slot: "left" },
            { text: "  " },
        ]);
    });

    it("take a separator of their own, and sit right or center", () => {
        const text = (input: unknown) =>
            crumbs(input, 24)
                .map((piece) => piece.text)
                .join("");
        expect(text({ right: { breadcrumb: true, separator: "/" } })).toBe(
            "  HOME/READOUTS/SPINNERS",
        );
        expect(text({ center: { breadcrumb: true, separator: "/" } })).toBe(
            " HOME/READOUTS/SPINNERS ",
        );
    });

    it("lose steps from the left when they don't fit", () => {
        const text = (columns: number) =>
            crumbs({ left: { breadcrumb: true } }, columns)
                .map((piece) => piece.text)
                .join("");
        expect(text(26)).toBe("HOME › READOUTS › SPINNERS");
        expect(text(25)).toBe("… › READOUTS › SPINNERS  ");
        expect(text(22)).toBe("SPINNERS              ");
        expect(text(5)).toBe("SPINN");
    });

    it("leave room for the rest of the line", () => {
        const text = crumbs({ left: { breadcrumb: true }, right: "[HOME]" }, 30)
            .map((piece) => piece.text)
            .join("");
        expect(text).toBe("… › READOUTS › SPINNERS [HOME]");
    });

    it("with no trail, show nothing", () => {
        expect(drawn({ left: { breadcrumb: true }, right: "R" }, 4)).toBe("   R");
    });
});
