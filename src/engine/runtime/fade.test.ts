import { describe, expect, it } from "vitest";
import type { Frame } from "../reveal/types.ts";
import { createTestTerminal } from "./test-helpers.ts";

const FILE = {
    config: { name: "Test", defaults: { teletype: { speed: 10 } } },
    screens: {
        plain: { content: ["abc"] },
        faded: { transition: "fade" as const, content: ["new"] },
        slow: { transition: { type: "fade" as const, duration: 250 }, content: ["slow"] },
    },
};

const join = (frame: Frame) => frame.map((s) => s.text).join("");

describe("fade transition", () => {
    it("keeps the old screen, untouched, for the fade's duration", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.navigate("plain");
        ticker.advance(100);
        const old = terminal.getSnapshot().screen?.run;
        const frames: string[] = [];
        old?.subscribeFrame(0, (f) => frames.push(join(f)));

        terminal.navigate("faded");
        expect(terminal.getSnapshot().outgoing).toMatchObject({
            run: old,
            transition: { type: "fade", duration: 600 },
        });
        ticker.advance(599);
        expect(terminal.getSnapshot().outgoing).not.toBeNull();
        ticker.advance(1);
        expect(terminal.getSnapshot().outgoing).toBeNull();
        // the view does the fading; the text stays as it was
        expect(frames).toEqual(["abc"]);
    });

    it("takes its duration from the screen", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.navigate("plain");
        terminal.navigate("slow");
        expect(terminal.getSnapshot().outgoing?.transition).toEqual({
            type: "fade",
            duration: 250,
        });
        ticker.advance(250);
        expect(terminal.getSnapshot().outgoing).toBeNull();
    });
});
