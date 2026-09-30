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
