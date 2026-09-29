import { describe, expect, it } from "vitest";
import type { ScreenRun } from "../../engine/runtime/screen-run.ts";
import { createTestTerminal } from "../../engine/runtime/test-helpers.ts";
import { type ColumnsElement, columnLayout } from "./definition.ts";

const columns = (props: Partial<ColumnsElement> = {}): ColumnsElement => ({
    id: "c",
    type: "columns",
    count: 3,
    gap: 2,
    order: "down",
    content: [],
    ...props,
});

describe("column layout", () => {
    it("splits the characters into equal columns, less the gaps", () => {
        expect(columnLayout(columns(), 62)).toEqual({ count: 3, width: 19 });
    });

    it("uses fewer columns when they'd be narrower than minWidth", () => {
        expect(columnLayout(columns({ minWidth: 16 }), 62)).toEqual({ count: 3, width: 19 });
        expect(columnLayout(columns({ minWidth: 16 }), 40)).toEqual({ count: 2, width: 19 });
        expect(columnLayout(columns({ minWidth: 16 }), 20)).toEqual({ count: 1, width: 20 });
    });
});

describe("columns in a program", () => {
    const setup = () => {
        const { terminal, ticker } = createTestTerminal(
            {
                config: { name: "T" },
                screens: {
                    home: {
                        content: [
                            { type: "columns", count: 2, content: ["one two three", "b", "c"] },
                            "after",
                        ],
                    },
                },
            },
            { columns: 22 },
        );
        terminal.start();
        return { terminal, ticker, run: terminal.getSnapshot().screen?.run as ScreenRun };
    };
    const text = (run: ScreenRun, index: number) => {
        let drawn = "";
        run.subscribeFrame(index, (frame) => {
            drawn = frame.map((segment) => segment.text).join("");
        })();
        return drawn;
    };

    it("wraps each item to its column's width", () => {
        const { terminal, run } = setup();
        terminal.skip();
        const contents = run.contents("home#0") as ScreenRun;
        // 22 characters, less a gap of 2, in 2 columns: 10 each
        expect(contents.width).toBe(10);
        expect(text(contents, 0)).toBe("one two\nthree");
        terminal.setColumns(40);
        expect(text(contents, 0)).toBe("one two three");
    });

    it("reveals its contents in order, before the rest of the screen", () => {
        const { run, ticker } = setup();
        ticker.advance(50, 10);
        expect(run.states).toEqual(["done", "ready"]);
        ticker.advance(1000, 10);
        expect(run.contents("home#0")?.states).toEqual(["done", "done", "done"]);
        expect(run.states).toEqual(["done", "done"]);
    });
});
