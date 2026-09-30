import { describe, expect, it } from "vitest";
import type { ScreenRun } from "../runtime/screen-run.ts";
import { createTestTerminal } from "../runtime/test-helpers.ts";
import { parseProgram, type TeletronixFile } from "./program.ts";

const file = (preset: object, extra: object = {}): TeletronixFile => ({
    config: { name: "Test", reveal: "instant" },
    screens: {
        boot: { preset: { type: "boot", ...preset }, ...extra } as never,
        home: { content: ["HOME"] },
    },
});

const texts = (input: TeletronixFile) => {
    const result = parseProgram(input);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.program.screens.get("boot")?.content ?? [];
};

describe("the boot preset", () => {
    it("becomes a title, a memory test, a checklist and a last line", () => {
        const content = texts(file({}));
        expect(content.map((element) => element.type)).toEqual([
            "text",
            "text",
            "text",
            "counter",
            "text",
            "checklist",
            "text",
            "text",
        ]);
        expect(content[0]).toMatchObject({ text: "TELETRONIX SYSTEM BIOS v1.0" });
        expect(content[3]).toMatchObject({ to: 640, label: "MEMORY TEST: ", done: " OK" });
        expect(content.at(-1)).toMatchObject({ text: "BOOT COMPLETE." });
    });

    it("takes its own wording, and leaves out what's false", () => {
        const content = texts(
            file({
                title: "MU-TH-UR 6000",
                copyright: false,
                memory: { size: 64, unit: " WORDS" },
                checks: ["LIFE SUPPORT", { text: "CRYO", status: "[FAIL]" }],
                status: "[ONLINE]",
                ready: false,
            }),
        );
        expect(content.map((element) => element.type)).toEqual([
            "text",
            "text",
            "counter",
            "text",
            "checklist",
        ]);
        expect(content[0]).toMatchObject({ text: "MU-TH-UR 6000" });
        expect(content[2]).toMatchObject({ to: 64, unit: " WORDS", label: "MEMORY TEST: " });
        expect(content[4]).toMatchObject({
            status: "[ONLINE]",
            items: ["LIFE SUPPORT", { text: "CRYO", status: "[FAIL]" }],
        });
        expect(texts(file({ memory: 128 }))[3]).toMatchObject({ to: 128 });
    });

    it("puts the screen's own content after it, then the pause", () => {
        const content = texts(file({ pause: "HIT A KEY" }, { content: ["EXTRA"] }));
        expect(content.slice(-3)).toMatchObject([
            { text: "EXTRA" },
            { text: "" },
            { type: "pause", text: "HIT A KEY" },
        ]);
        expect(texts(file({ pause: true })).at(-1)).toMatchObject({
            type: "pause",
            text: "PRESS ANY KEY TO CONTINUE",
        });
    });

    it("goes to its next screen once it has finished", () => {
        const { terminal, ticker } = createTestTerminal(file({ next: "home", after: 500 }));
        terminal.navigate("boot");
        ticker.advance(20_000, 10);
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("home");
    });

    it("waits for a key first, with a pause", () => {
        const { terminal, ticker } = createTestTerminal(file({ next: "home", pause: true }));
        terminal.navigate("boot");
        ticker.advance(20_000, 10);
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        expect(run.screen.id).toBe("boot");
        terminal.pressKey(" ");
        ticker.advance(10, 10);
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("home");
    });

    it("is needed by a screen without content", () => {
        const result = parseProgram({ config: { name: "Test" }, screens: { empty: {} } });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.errors).toEqual(
            expect.arrayContaining([expect.objectContaining({ path: "screens.empty.content" })]),
        );
    });

    it("reports an unknown next screen", () => {
        const result = parseProgram({
            config: { name: "Test" },
            screens: { boot: { preset: { type: "boot", next: "nowhere" } } },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0]?.message).toBe('Unknown screen "nowhere"');
    });
});

const screenFile = (preset: object, extra: object = {}): TeletronixFile => ({
    config: { name: "Test", reveal: "instant", start: "home" },
    screens: {
        home: { content: ["HOME"] },
        preset: { preset, ...extra } as never,
        elsewhere: { content: ["ELSEWHERE"] },
    },
});

const expanded = (preset: object) => {
    const result = parseProgram(screenFile(preset));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const screen = result.program.screens.get("preset");
    return { content: screen?.content ?? [], next: screen?.next };
};

describe("the shutdown preset", () => {
    it("stops things, says so, switches off, and waits to go to the start screen", () => {
        const { content, next } = expanded({ type: "shutdown" });
        expect(content.map((element) => element.type)).toEqual([
            "text",
            "text",
            "checklist",
            "text",
            "text",
            "power-off",
            "pause",
        ]);
        expect(content[4]).toMatchObject({ text: "IT IS NOW SAFE TO TURN OFF YOUR COMPUTER." });
        expect(content[5]).toMatchObject({ delay: 1500 });
        expect(next).toEqual([{ after: 0, action: [{ screen: "home" }] }]);
    });

    it("can stay on, or off for good, and go elsewhere", () => {
        const on = expanded({ type: "shutdown", powerOff: false, next: "elsewhere" });
        expect(on.content.slice(-2)).toMatchObject([{ text: "" }, { type: "pause" }]);
        expect(on.next?.[0]?.action).toEqual([{ screen: "elsewhere" }]);

        const forever = expanded({ type: "shutdown", restart: false, checks: false });
        expect(forever.content.at(-1)?.type).toBe("power-off");
        expect(forever.next).toBeUndefined();
    });

    it("switches off, then back on with a key", () => {
        const { terminal, ticker } = createTestTerminal(
            screenFile({ type: "shutdown", after: 100 }),
        );
        terminal.navigate("preset");
        ticker.advance(20_000, 10);
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("preset");
        terminal.pressKey("x");
        ticker.advance(10, 10);
        expect(terminal.getSnapshot().screen?.run.screen.id).toBe("home");
    });
});

describe("the error preset", () => {
    it("puts its lines in a box, each centered, then waits to restart", () => {
        const { content, next } = expanded({
            type: "error",
            title: "OOPS",
            message: ["A LONGER LINE"],
            code: false,
        });
        expect(content[0]).toMatchObject({
            type: "text",
            text: "    OOPS\n\nA LONGER LINE",
            align: "center",
            className: "alert error-box",
        });
        expect(content.at(-1)).toMatchObject({
            type: "pause",
            text: "PRESS ANY KEY TO RESTART",
            className: "alert",
        });
        expect(next?.[0]?.action).toEqual([{ screen: "home" }]);
    });

    it("can stay for good", () => {
        const { content, next } = expanded({ type: "error", restart: false });
        expect(content.map((element) => element.type)).toEqual(["text"]);
        expect(next).toBeUndefined();
    });
});

describe("the crash preset", () => {
    it("goes on for good, unless it has a next screen", () => {
        const forever = expanded({ type: "crash", message: "BOOM" });
        expect(forever.content).toMatchObject([{ type: "crash", message: ["BOOM"] }]);
        expect(forever.next).toBeUndefined();

        const restarts = expanded({ type: "crash", next: "home" });
        expect(restarts.content.map((element) => element.type)).toEqual(["crash", "pause"]);
        expect(restarts.next?.[0]?.action).toEqual([{ screen: "home" }]);
    });
});

describe("the hex editor preset", () => {
    it("is a hex dump filling the screen, with a header bar and an exit", () => {
        const result = parseProgram(
            screenFile({ type: "hexeditor", file: "CREW.DAT", size: 256, text: "SECRET" }),
        );
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        const screen = result.program.screens.get("preset");
        expect(screen?.content).toMatchObject([
            {
                type: "hexdump",
                rows: "fill",
                size: 256,
                text: "SECRET",
                exit: { key: ["escape"], action: [{ screen: "home" }] },
            },
        ]);
        expect(screen?.header).toEqual([
            {
                left: { text: "HEXEDIT 2.1  CREW.DAT" },
                right: { text: "ESC: EXIT", action: [{ screen: "home" }] },
            },
        ]);
        // (no next rule: a tap on the screen shouldn't leave)
        expect(screen?.next).toBeUndefined();
    });
});
