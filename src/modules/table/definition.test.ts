import { describe, expect, it } from "vitest";
import type { ScreenRun } from "../../engine/runtime/screen-run.ts";
import { createTestTerminal } from "../../engine/runtime/test-helpers.ts";
import { type TableElement, tableText } from "./definition.ts";

const table = (props: Partial<TableElement> = {}): TableElement => ({
    id: "t",
    type: "table",
    border: "none",
    gap: 2,
    columns: [
        { title: "NAME", align: "left" },
        { title: "QTY", align: "right" },
    ],
    rows: [
        ["CRATES", 12],
        ["O2 CANISTERS", 3],
    ],
    ...props,
});

describe("table", () => {
    it("spaces its columns to their widest cells, with the header underlined", () => {
        expect(tableText(table()).split("\n")).toEqual([
            "NAME          QTY",
            "────────────  ───",
            "CRATES         12",
            "O2 CANISTERS    3",
        ]);
    });

    it("draws a box", () => {
        expect(tableText(table({ border: "box" })).split("\n")).toEqual([
            "┌──────────────┬─────┐",
            "│ NAME         │ QTY │",
            "├──────────────┼─────┤",
            "│ CRATES       │  12 │",
            "│ O2 CANISTERS │   3 │",
            "└──────────────┴─────┘",
        ]);
    });

    it("has no header without titles, and cuts cells to a set width", () => {
        expect(tableText(table({ columns: [{ align: "left", width: 5 }] })).split("\n")).toEqual([
            "CRATE  12",
            // (the second column has no settings, so it's left-aligned)
            "O2 CA  3",
        ]);
    });

    it("sizes columns to the values of variables in them, and is never wrapped", () => {
        const { terminal } = createTestTerminal(
            {
                config: { name: "T", variables: { crew: "OKAFOR, VANCE AND MBEKI" } },
                screens: {
                    home: {
                        content: [
                            {
                                type: "table",
                                columns: [{ title: "SHIP" }, { title: "CREW" }],
                                rows: [["RELAY", "{crew}"]],
                            },
                        ],
                    },
                },
            },
            { instant: true, columns: 20 },
        );
        terminal.start();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        let drawn = "";
        run.subscribeFrame(0, (frame) => {
            drawn = frame.map((segment) => segment.text).join("");
        })();
        expect(drawn.split("\n")).toEqual([
            "SHIP   CREW",
            "─────  ───────────────────────",
            "RELAY  OKAFOR, VANCE AND MBEKI",
        ]);
    });
});
