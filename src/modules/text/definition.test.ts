import { describe, expect, it } from "vitest";
import type { ScreenRun } from "../../engine/runtime/screen-run.ts";
import { createTestTerminal, deferred, settle } from "../../engine/runtime/test-helpers.ts";
import { parseProgram, type TeletronixFile } from "../../engine/schema/program.ts";
import { cleanText } from "./definition.ts";

const ART = " /\\\n/__\\";

const FILE: TeletronixFile = {
    config: { name: "T", reveal: "instant" },
    screens: {
        home: {
            content: [
                "before",
                { type: "text", src: "data/art/tent.txt", wrap: false },
                { type: "text", src: "data/art/missing.txt" },
                "after",
            ],
        },
    },
};

const drawn = (run: ScreenRun, index: number) => {
    let text = "";
    run.subscribeFrame(index, (frame) => {
        text = frame.map((segment) => segment.text).join("");
    })();
    return text;
};

describe("text from a file", () => {
    it("waits for the file, then shows its text exactly", async () => {
        const file = deferred();
        const missing = deferred();
        const { terminal } = createTestTerminal(FILE, {
            load: (element) =>
                element.type === "text" && element.src
                    ? (element.src.includes("tent") ? file : missing).promise.then(() => ART)
                    : undefined,
        });
        terminal.start();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        expect(run.states).toEqual(["done", "unloaded", "unloaded", "ready"]);

        file.resolve();
        missing.reject(new Error("404"));
        await settle();
        expect(run.states).toEqual(["done", "done", "done", "done"]);
        expect(drawn(run, 1)).toBe(ART);
        expect(drawn(run, 2)).toBe("[FILE UNAVAILABLE: data/art/missing.txt]");
    });

    it("needs text or a file, not both", () => {
        const result = parseProgram({
            config: { name: "T" },
            screens: {
                home: { content: [{ type: "text", text: "x", src: "y.txt" }, { type: "text" }] },
            },
        } as TeletronixFile);
        expect(result.ok ? [] : result.errors.map((e) => e.message)).toEqual([
            'Give it "text" or "src" (a text file), not both',
            'Give it "text" or "src" (a text file), not both',
        ]);
    });

    it("tidies line endings", () => {
        expect(cleanText("a\r\nb\rc\n\n")).toBe("a\nb\nc");
    });
});
