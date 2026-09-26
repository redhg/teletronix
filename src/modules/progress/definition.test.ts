import { describe, expect, it } from "vitest";
import type { Frame } from "../../engine/reveal/types.ts";
import { createTestTerminal } from "../../engine/runtime/test-helpers.ts";
import { parseProgram, type TeletronixFile } from "../../engine/schema/program.ts";
import { type ProgressElement, progressLine } from "./definition.ts";

// Bars appear instantly, then fill; 20 columns
const program = (bars: Record<string, object>, extra: Partial<TeletronixFile> = {}) => {
    const screens: TeletronixFile["screens"] = {
        after: { content: ["after"] },
        menu: { content: ["menu"] },
    };
    for (const [id, bar] of Object.entries(bars)) {
        screens[id] = { content: [{ type: "progress", ...bar } as never, "next line"] };
    }
    return {
        config: { name: "Test", defaults: { reveal: "instant" as const } },
        screens,
        dialogs: { oops: { type: "alert" as const, content: "!" } },
        ...extra,
    };
};

function setup(bars: Record<string, object>) {
    const { terminal, ticker } = createTestTerminal(program(bars), { columns: 20 });
    const lines: string[] = [];
    const show = (id: string) => {
        terminal.navigate(id);
        terminal
            .getSnapshot()
            .screen?.run.subscribeFrame(0, (frame: Frame) =>
                lines.push(frame.map((s) => s.text).join("")),
            );
    };
    const screen = () => terminal.getSnapshot().screen;
    return { terminal, ticker, lines, show, screen };
}

const bar = (overrides: Partial<ProgressElement> = {}): ProgressElement => ({
    id: "x",
    type: "progress",
    from: 0,
    to: 100,
    duration: 1000,
    percent: true,
    fill: "#",
    empty: ".",
    ...overrides,
});

describe("progressLine", () => {
    it("draws a bar that fills the line, with the percentage", () => {
        // 20 columns - "[" - "]" - " 100%" = 13 cells
        expect(progressLine(bar(), 0, 20)).toBe("[.............]   0%");
        expect(progressLine(bar(), 50, 20)).toBe("[#######......]  50%");
        expect(progressLine(bar(), 100, 20)).toBe("[#############] 100%");
    });

    it("takes a label, a fixed width, and can hide the percentage", () => {
        expect(progressLine(bar({ label: "DL ", width: 4, percent: false }), 50, 80)).toBe(
            "DL [##..]",
        );
    });

    it("keeps room for the interruption text, so the bar doesn't change width", () => {
        const failing = bar({ interrupt: { at: 50, text: "LOST CONNECTION" } });
        expect(progressLine(failing, 50, 30).indexOf("]")).toBe(
            progressLine(failing, 50, 30, "LOST CONNECTION").indexOf("]"),
        );
        expect(progressLine(failing, 50, 30, "LOST CONNECTION")).toMatch(/\] LOST CONNECTION$/);
    });
});

describe("progress", () => {
    it("runs from `from` to `to` over its duration, then carries on", () => {
        const { ticker, lines, show, screen } = setup({
            bar: { from: 54, to: 75, duration: 1000 },
        });
        show("bar");
        ticker.advance(500);
        ticker.advance(499);
        expect(screen()?.states).toEqual(["active", "ready"]);
        ticker.advance(1);
        expect(lines.map((l) => l.slice(-4))).toEqual([" 54%", " 65%", " 75%"]);
        // the next line (revealed instantly here) follows
        expect(screen()?.states).toEqual(["done", "done"]);
    });

    it("runs backwards", () => {
        const { ticker, lines, show } = setup({ bar: { from: 77, to: 0, duration: 1000 } });
        show("bar");
        ticker.advance(500);
        ticker.advance(500);
        expect(lines.map((l) => l.trim().slice(-3).trim())).toEqual(["77%", "39%", "0%"]);
    });

    it("runs its onComplete action, after its pause, instead of carrying on", () => {
        const { ticker, show, screen } = setup({
            bar: { duration: 1000, onComplete: { after: 300, action: { screen: "after" } } },
        });
        show("bar");
        ticker.advance(1000);
        expect(screen()?.states).toEqual(["done", "ready"]);
        ticker.advance(299);
        expect(screen()?.run.screen.id).toBe("bar");
        ticker.advance(1);
        expect(screen()?.run.screen.id).toBe("after");
    });

    it("carries on behind a dialog that onComplete opens", () => {
        const { terminal, ticker, show, screen } = setup({
            bar: { duration: 100, onComplete: { dialog: "oops" } },
        });
        show("bar");
        ticker.advance(100);
        expect(terminal.getSnapshot().dialog?.id).toBe("oops");
        expect(screen()?.states).toEqual(["done", "done"]);
    });

    it("stops at a scripted interruption, shows its text, and runs its action", () => {
        const { ticker, lines, show, screen } = setup({
            bar: {
                duration: 1000,
                onComplete: { screen: "after" },
                interrupt: { at: 50, text: "FAILED", action: { screen: "menu" } },
            },
        });
        show("bar");
        ticker.advance(499);
        expect(screen()?.states).toEqual(["active", "ready"]);
        ticker.advance(1); // reaches 50% halfway through the duration
        expect(lines.at(-1)).toMatch(/\] FAILED$/);
        expect(screen()?.run.screen.id).toBe("menu");
    });

    it("carries on after an interruption without an action", () => {
        const { ticker, show, screen } = setup({ bar: { duration: 1000, interrupt: { at: 50 } } });
        show("bar");
        ticker.advance(500);
        expect(screen()?.states).toEqual(["done", "done"]);
    });

    it("can be aborted with a key while it runs", () => {
        const { terminal, ticker, lines, show, screen } = setup({
            bar: {
                duration: 1000,
                onComplete: { screen: "after" },
                interrupt: { key: "Escape", text: "ABORTED", action: { screen: "menu" } },
            },
        });
        show("bar");
        ticker.advance(250);
        expect(terminal.pressKey("x")).toBe(false);
        expect(terminal.pressKey("Escape")).toBe(true);
        expect(lines.at(-1)).toMatch(/ ABORTED$/);
        expect(lines.at(-1)?.split("█").length).toBe(4); // 3 of 13 cells at 25%
        expect(screen()?.run.screen.id).toBe("menu");
    });

    it("jumps to the end when skipped, and still runs onComplete", () => {
        const { terminal, lines, show, screen } = setup({
            bar: { duration: 1000, onComplete: { screen: "after" } },
        });
        show("bar");
        terminal.skip();
        expect(lines.at(-1)).toMatch(/ 100%$/);
        expect(screen()?.run.screen.id).toBe("after");
    });

    it("stops at a scripted interruption when skipped, not past it", () => {
        const { terminal, lines, show, screen } = setup({
            bar: { duration: 1000, interrupt: { at: 30, text: "LOST" } },
        });
        show("bar");
        terminal.skip();
        expect(lines.at(-1)).toMatch(/ LOST$/);
        expect(screen()?.states).toEqual(["done", "done"]);
    });

    it("refits to the line when the window resizes", () => {
        const { terminal, ticker, lines, show } = setup({ bar: { duration: 100 } });
        show("bar");
        ticker.advance(100);
        terminal.setColumns(30);
        expect(lines.at(-1)).toHaveLength(30);
    });
});

describe("progress schema", () => {
    const parse = (props: object) => parseProgram(program({ bar: props }));

    it("fills in defaults", () => {
        const result = parse({});
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        expect(result.program.screens.get("bar")?.content[0]).toMatchObject({
            from: 0,
            to: 100,
            duration: 2000,
            percent: true,
            fill: "█",
            empty: "░",
        });
    });

    it("wants the interruption point between from and to", () => {
        const result = parse({ from: 80, to: 20, interrupt: { at: 90 } });
        expect(result.ok ? [] : result.errors).toEqual([
            {
                path: "screens.bar.content[0].interrupt.at",
                message: "at must be between from and to",
            },
        ]);
    });

    it("checks action targets", () => {
        const result = parse({ onComplete: { screen: "nowhere" } });
        expect(result.ok ? [] : result.errors).toEqual([
            { path: "screens.bar.content[0]", message: 'Unknown screen "nowhere"' },
        ]);
    });
});
