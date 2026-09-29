import { describe, expect, it } from "vitest";
import type { ScreenRun } from "../../engine/runtime/screen-run.ts";
import { createTestTerminal } from "../../engine/runtime/test-helpers.ts";
import { parseProgram, type TeletronixFile } from "../../engine/schema/program.ts";

// teletype at 10ms a character
const FILE: TeletronixFile = {
    config: { name: "Test", variables: { clearance: false } },
    screens: {
        home: {
            content: [
                { type: "section", title: "LOGS", content: ["abc", "de"] },
                {
                    type: "section",
                    title: "OPEN",
                    open: true,
                    markers: { closed: ">", open: "v" },
                    content: [
                        "xyz",
                        { type: "text", text: "SECRET", if: { clearance: true } },
                        { type: "section", title: "INNER", open: true, content: ["i"] },
                    ],
                },
                "end",
            ],
        },
        away: { content: [] },
    },
};

const text = (run: ScreenRun, index: number) => {
    let drawn = "";
    run.subscribeFrame(index, (frame) => {
        drawn = frame.map((segment) => segment.text).join("");
    })();
    return drawn;
};

describe("sections", () => {
    it("get ids inside their parents", () => {
        const result = parseProgram(FILE);
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        const open = result.program.screens.get("home")?.content[1];
        expect(open?.type === "section" && open.content.map((e) => e.id)).toEqual([
            "home#1.0",
            "home#1.1",
            "home#1.2",
        ]);
    });

    it("check their contents, with paths into them", () => {
        const result = parseProgram({
            config: { name: "Test" },
            screens: {
                home: {
                    content: [
                        {
                            type: "section",
                            title: "S",
                            content: [{ type: "link", text: "x", action: { screen: "nope" } }],
                        },
                    ],
                },
            },
        });
        expect(result.ok ? [] : result.errors).toEqual([
            { path: "screens.home.content[0].content[0]", message: 'Unknown screen "nope"' },
        ]);
    });

    it("show a header with a marker; an open one reveals its contents before the screen carries on", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.start();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        ticker.advance(1000, 10);

        expect(text(run, 0)).toBe("[+] LOGS");
        expect(run.contents("home#0")).toBeNull();
        expect(text(run, 1)).toBe("v OPEN");
        const open = run.contents("home#1") as ScreenRun;
        // conditions are checked as it opens
        expect(open.elements.map((e) => e.id)).toEqual(["home#1.0", "home#1.2"]);
        expect(text(open.contents("home#1.2") as ScreenRun, 0)).toBe("i");
        expect(text(run, 2)).toBe("end");

        // "end" came after everything in the open section: 8 + 6 + 3 + 9 + 1 + 3 characters
        expect(run.finishedAt).toBe(300);
    });

    it("open and close when clicked, revealing their contents", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.start();
        terminal.skip();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        const finished = run.finishedAt;

        terminal.remember("home#0", true);
        expect(text(run, 0)).toBe("[-] LOGS");
        const logs = run.contents("home#0") as ScreenRun;
        expect(logs.finishedAt).toBeNull();
        ticker.advance(20, 10);
        expect(text(logs, 0)).toMatch(/^ab/);
        ticker.advance(100, 10);
        expect(logs.finishedAt).not.toBeNull();
        expect(run.finishedAt).toBe(finished);

        terminal.remember("home#0", false);
        expect(run.contents("home#0")).toBeNull();
        expect(text(run, 0)).toBe("[+] LOGS");
    });

    it("finish at once when skipped, contents and all", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.start();
        terminal.skip();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        expect(text(run.contents("home#1") as ScreenRun, 0)).toBe("xyz");
        expect(run.animating).toBe(false);
    });

    it("carry on after an outcome inside them, e.g. a progress bar's", () => {
        const { terminal, ticker } = createTestTerminal({
            config: { name: "Test", reveal: "instant" },
            screens: {
                home: {
                    content: [
                        {
                            type: "section",
                            title: "S",
                            open: true,
                            content: [
                                {
                                    type: "progress",
                                    duration: 100,
                                    onComplete: { dialog: "done" },
                                },
                                "after",
                            ],
                        },
                        "end",
                    ],
                },
            },
            dialogs: { done: { type: "alert", content: "!" } },
        });
        terminal.start();
        ticker.advance(200, 10);
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        expect(terminal.getSnapshot().dialog?.id).toBe("done");
        expect(run.contents("home#0")?.states).toEqual(["done", "done"]);
        expect(run.states).toEqual(["done", "done"]);
    });

    it("indent their contents, which wrap to the narrower width", () => {
        const { terminal } = createTestTerminal(
            {
                config: { name: "Test" },
                screens: {
                    home: {
                        content: [
                            {
                                type: "section",
                                title: "S",
                                open: true,
                                indent: 4,
                                content: ["one two three"],
                            },
                        ],
                    },
                },
            },
            { instant: true, columns: 12 },
        );
        terminal.start();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        const contents = run.contents("home#0") as ScreenRun;
        // 12 columns, less 4
        expect(text(contents, 0)).toBe("one two\nthree");
        terminal.setColumns(20);
        expect(text(contents, 0)).toBe("one two three");
    });

    it("remember whether they're open", () => {
        const { terminal } = createTestTerminal(FILE, { instant: true });
        terminal.start();
        terminal.remember("home#0", true);
        terminal.remember("home#1", false);
        terminal.navigate("away");
        terminal.navigate("home");
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        expect(run.contents("home#0")).not.toBeNull();
        expect(run.contents("home#1")).toBeNull();
    });
});
