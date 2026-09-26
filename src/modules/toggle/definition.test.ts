import { describe, expect, it } from "vitest";
import type { Frame } from "../../engine/reveal/types.ts";
import { createTestTerminal } from "../../engine/runtime/test-helpers.ts";
import { parseProgram } from "../../engine/schema/program.ts";
import { nextToggleState, type ToggleElement } from "./definition.ts";

const FILE = {
    config: { name: "Test", reveal: "instant" as const },
    screens: {
        home: {
            content: [{ type: "toggle" as const, states: ["> A", "> B", "> C"], initial: 1 }],
        },
        other: { content: ["x"] },
    },
};

const join = (frame: Frame) => frame.map((s) => s.text).join("");

describe("toggle", () => {
    it("starts on its initial state and cycles, wrapping around", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.start();
        const run = terminal.getSnapshot().screen?.run;
        const element = run?.elements[0] as ToggleElement;
        const shown: string[] = [];
        const texts: string[] = [];
        run?.subscribeFrame(0, (frame, text) => {
            shown.push(join(frame));
            texts.push(text);
        });

        for (let i = 0; i < 3; i++) {
            terminal.remember(
                element.id,
                nextToggleState(element, terminal.recall<number>(element.id)),
            );
        }
        expect(shown).toEqual(["> B", "> C", "> A", "> B"]);
        expect(texts).toEqual(shown);
    });

    it("remembers its state across visits", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.start();
        const element = terminal.getSnapshot().screen?.run.elements[0] as ToggleElement;
        terminal.remember(element.id, 2);
        terminal.navigate("other");
        terminal.navigate("home");

        const frames: string[] = [];
        terminal.getSnapshot().screen?.run.subscribeFrame(0, (f) => frames.push(join(f)));
        expect(frames).toEqual(["> C"]);
    });

    it("rejects an initial state that doesn't exist", () => {
        const result = parseProgram({
            config: { name: "Test" },
            screens: { home: { content: [{ type: "toggle", states: ["a", "b"], initial: 2 }] } },
        });
        expect(result.ok ? [] : result.errors).toEqual([
            {
                path: "screens.home.content[0].initial",
                message: "initial must be the index of one of the states",
            },
        ]);
    });
});
