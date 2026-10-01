import { describe, expect, it } from "vitest";
import type { ScreenRun } from "../../engine/runtime/screen-run.ts";
import { createTestTerminal } from "../../engine/runtime/test-helpers.ts";
import { ActionSchema } from "../../engine/schema/common.ts";
import { parseProgram, type TeletronixFile } from "../../engine/schema/program.ts";
import { type FrameElement, frameLayout, frameTop } from "./definition.ts";

// teletype at 10ms a character
const FILE: TeletronixFile = {
    config: { name: "Test" },
    screens: {
        home: {
            content: [
                "top",
                {
                    type: "frames",
                    frames: [
                        { title: "LOG", content: ["aaaaaaaaaa", "bbbbbbbbbb"] },
                        { content: ["ccccc"] },
                    ],
                },
                "end",
            ],
        },
    },
};

const text = (run: ScreenRun, index: number) => {
    let drawn = "";
    run.subscribeFrame(index, (frame) => {
        drawn = frame.map((segment) => segment.text).join("");
    })();
    return drawn;
};

const frames = (input: Partial<FrameElement>[], gap = 1, minWidth = 20) =>
    input.map(
        (frame, index) =>
            ({
                type: "frame",
                id: `f.${index}`,
                rows: 10,
                border: true,
                autoscroll: true,
                content: [],
                layout: { gap, minWidth },
                ...frame,
            }) as FrameElement,
    );

describe("frames", () => {
    it("are elements of their own, with ids and checked contents", () => {
        const result = parseProgram(FILE);
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        const element = result.program.screens.get("home")?.content[1];
        expect(element?.type === "frames" && element.frames.map((f) => [f.id, f.type])).toEqual([
            ["home#1.0", "frame"],
            ["home#1.1", "frame"],
        ]);
        expect(element?.type === "frames" && element.frames[0]?.content.map((e) => e.id)).toEqual([
            "home#1.0.0",
            "home#1.0.1",
        ]);

        const bad = parseProgram({
            config: { name: "T" },
            screens: {
                home: {
                    content: [
                        {
                            type: "frames",
                            frames: [
                                {
                                    content: [
                                        { type: "link", text: "x", action: { screen: "nope" } },
                                        { type: "pause" },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
        });
        expect(bad.ok ? [] : bad.errors.map((error) => error.path)).toEqual([
            "screens.home.content[0].frames[0].content[0]",
            "screens.home.content[0].frames[0].content[1]",
        ]);
    });

    it("reveal side by side, each with its own cursor, then the screen carries on", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.start();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        // "top": 3 characters
        ticker.advance(60, 10);
        const group = run.contents("home#1") as ScreenRun;
        const [left, right] = [
            group.contents("home#1.0") as ScreenRun,
            group.contents("home#1.1") as ScreenRun,
        ];
        // both typing at once
        expect(text(left, 0)).toMatch(/^a{2,}/);
        expect(text(right, 0)).toMatch(/^c{2,}/);

        // the right finishes first; the screen waits for the left
        ticker.advance(60, 10);
        expect(right.finishedAt).not.toBeNull();
        expect(left.finishedAt).toBeNull();
        expect(text(run, 2)).toBe("");
        ticker.advance(200, 10);
        expect(left.finishedAt).not.toBeNull();
        expect(text(run, 2)).toBe("end");
        // 3 + 20 (the left frame) + 3
        expect(run.finishedAt).toBe(260);
    });

    it("finish together when skipped", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.start();
        terminal.skip();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        const group = run.contents("home#1") as ScreenRun;
        expect(text(group.contents("home#1.0") as ScreenRun, 1)).toBe("bbbbbbbbbb");
        expect(text(run, 2)).toBe("end");
        expect(run.animating).toBe(false);
    });

    it("wrap their contents to their width, inside the border", () => {
        const { terminal } = createTestTerminal(FILE, { columns: 41 });
        terminal.start();
        terminal.skip();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        const group = run.contents("home#1") as ScreenRun;
        // (41 - 1) / 2 = 20 each, less 4 for the border
        expect((group.contents("home#1.0") as ScreenRun).width).toBe(16);
    });

    it("share the width, or stack when it's too narrow", () => {
        expect(frameLayout(frames([{}, {}]), 41)).toEqual({ stacked: false, widths: [20, 20] });
        expect(frameLayout(frames([{ width: 30 }, {}]), 61)).toEqual({
            stacked: false,
            widths: [30, 30],
        });
        expect(frameLayout(frames([{}, {}]), 30)).toEqual({ stacked: true, widths: [30, 30] });
        expect(frameLayout(frames([{ width: 50 }, {}]), 40).stacked).toBe(true);
    });

    it("draw their title into the top of the border", () => {
        const [frame] = frames([{ title: "LOG" }]);
        const top = frameTop(frame as FrameElement, 14);
        expect(top.before + top.title + top.after).toBe("┌─ LOG ──────┐");
        const [plain] = frames([{}]);
        const edge = frameTop(plain as FrameElement, 6);
        expect(edge.before + edge.title + edge.after).toBe("┌────┐");
        const [long] = frames([{ title: "A VERY LONG TITLE" }]);
        const cut = frameTop(long as FrameElement, 14);
        expect((cut.before + cut.title + cut.after).length).toBe(14);
    });

    describe("showing screens", () => {
        const file: TeletronixFile = {
            config: { name: "Test", reveal: "instant" },
            screens: {
                home: {
                    content: [
                        {
                            type: "frames",
                            frames: [{ content: ["MENU"] }, { name: "detail", screen: "dallas" }],
                        },
                    ],
                },
                dallas: { content: ["DALLAS"] },
                ripley: { content: ["RIPLEY", "WARRANT OFFICER"] },
            },
        };
        const show = (screen: string) => ActionSchema.parse({ frame: "detail", screen });
        const detail = (terminal: ReturnType<typeof createTestTerminal>["terminal"]) => {
            const run = terminal.getSnapshot().screen?.run as ScreenRun;
            const group = run.contents("home#0") as ScreenRun;
            const frame = group.contents("home#0.1") as ScreenRun;
            return frame.elements.map((element) => element.id);
        };

        it("start with their screen's content", () => {
            const { terminal } = createTestTerminal(file);
            terminal.start();
            expect(detail(terminal)).toEqual(["dallas#0"]);
        });

        it("show a screen a link puts there, without leaving, and remember it", () => {
            const { terminal } = createTestTerminal(file);
            terminal.start();
            terminal.dispatch(show("ripley"));
            expect(terminal.getSnapshot().screen?.run.screen.id).toBe("home");
            expect(detail(terminal)).toEqual(["ripley#0", "ripley#1"]);

            terminal.navigate("dallas");
            terminal.navigate("home");
            expect(detail(terminal)).toEqual(["ripley#0", "ripley#1"]);
        });

        it("go to the screen, where there's no such frame", () => {
            const { terminal } = createTestTerminal(file);
            terminal.navigate("dallas");
            terminal.dispatch(show("ripley"));
            expect(terminal.getSnapshot().screen?.run.screen.id).toBe("ripley");
        });

        it("are checked: frame names, and their screens", () => {
            const result = parseProgram({
                config: { name: "T" },
                screens: {
                    home: {
                        content: [
                            { type: "frames", frames: [{ name: "a", screen: "gone" }] },
                            { type: "link", text: "x", action: { frame: "b", screen: "home" } },
                        ],
                    },
                },
            });
            expect(result.ok ? [] : result.errors.map((error) => error.message)).toEqual([
                'Unknown screen "gone"',
                'No frame is named "b"',
            ]);
            expect(ActionSchema.safeParse({ frame: "a" }).success).toBe(false);
        });
    });
});
