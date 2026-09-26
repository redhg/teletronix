import { describe, expect, it } from "vitest";
import { seededRandom } from "../random.ts";
import type { Frame } from "../reveal/types.ts";
import { parseProgram, type TeletronixFile } from "../schema/program.ts";
import { ManualTicker } from "../time/ticker.ts";
import { Terminal } from "./terminal.ts";

const NBSP = " ";

const FILE: TeletronixFile = {
    config: { name: "Test", defaults: { teletype: { speed: 10 }, glitch: { duration: 100 } } },
    screens: {
        // "one" and "two" inherit glitch and form a block; "own" sets its own glitch
        // and "typed" breaks the block, so "three" starts a new one
        block: {
            reveal: "glitch",
            content: [
                "one",
                "two",
                { type: "text", text: "own", reveal: { type: "glitch", duration: 50 } },
                { type: "text", text: "typed", reveal: "teletype" },
                "three",
            ],
        },
        plain: { content: ["abc", "de"] },
        glitchy: { transition: "glitch", content: ["new"] },
        slow: { transition: { type: "glitch", duration: 300 }, content: ["slow"] },
    },
};

function setup(options: { instant?: boolean } = {}) {
    const result = parseProgram(FILE);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const ticker = new ManualTicker();
    const terminal = new Terminal({
        program: result.program,
        ticker,
        random: seededRandom(1),
        ...options,
    });
    return { terminal, ticker };
}

const states = (terminal: Terminal) => terminal.getSnapshot().screen?.states;
const join = (frame: Frame) => frame.map((s) => s.text).join("");

describe("glitch reveals", () => {
    it("reveals consecutive inherited glitch elements together, as one block", () => {
        const { terminal, ticker } = setup();
        terminal.navigate("block");
        expect(states(terminal)).toEqual(["active", "active", "ready", "ready", "ready"]);

        // an element reaches Done only when its glitch finishes
        ticker.advance(99);
        expect(states(terminal)).toEqual(["active", "active", "ready", "ready", "ready"]);
        ticker.advance(1);
        expect(states(terminal)).toEqual(["done", "done", "active", "ready", "ready"]);

        ticker.advance(50); // "own": its own 50ms glitch
        expect(states(terminal)).toEqual(["done", "done", "done", "active", "ready"]);
        ticker.advance(50); // "typed": 5 chars at 10ms
        expect(states(terminal)).toEqual(["done", "done", "done", "done", "active"]);
        ticker.advance(100);
        expect(states(terminal)).toEqual(["done", "done", "done", "done", "done"]);
    });

    it("splits a block's frames back into each element's text", () => {
        const { terminal, ticker } = setup();
        terminal.navigate("block");
        const run = terminal.getSnapshot().screen?.run;
        const first: string[] = [];
        const second: string[] = [];
        run?.subscribeFrame(0, (f) => first.push(join(f)));
        run?.subscribeFrame(1, (f) => second.push(join(f)));

        ticker.advance(100, 5);
        for (const frame of [...first, ...second]) expect(frame).toHaveLength(3);
        expect(first.at(-1)).toBe("one");
        expect(second.at(-1)).toBe("two");
        // mid-way it was neither blank nor finished
        expect(first.some((f) => f !== "one" && f !== NBSP.repeat(3))).toBe(true);
    });
});

describe("glitch transition", () => {
    it("keeps the old screen, erasing it over the new one until its glitch finishes", () => {
        const { terminal, ticker } = setup();
        terminal.navigate("plain");
        ticker.advance(100);
        const old = terminal.getSnapshot().screen?.run;

        terminal.navigate("glitchy");
        const snapshot = terminal.getSnapshot();
        expect(snapshot.screen?.run.screen.id).toBe("glitchy");
        expect(snapshot.outgoing?.run).toBe(old);
        // the new screen starts revealing straight away
        expect(snapshot.screen?.states).toEqual(["active"]);

        const erased: string[] = [];
        old?.subscribeFrame(0, (f) => erased.push(join(f)));
        ticker.advance(99, 10);
        expect(terminal.getSnapshot().outgoing).not.toBeNull();
        ticker.advance(1);
        expect(terminal.getSnapshot().outgoing).toBeNull();

        expect(erased[0]).toBe("abc");
        expect(erased.at(-1)).toBe(NBSP.repeat(3));
    });

    it("uses the destination screen's transition options", () => {
        const { terminal, ticker } = setup();
        terminal.navigate("plain");
        terminal.navigate("slow");
        ticker.advance(299);
        expect(terminal.getSnapshot().outgoing).not.toBeNull();
        ticker.advance(1);
        expect(terminal.getSnapshot().outgoing).toBeNull();
    });

    it("only erases elements that were on screen", () => {
        const { terminal } = setup();
        terminal.navigate("plain"); // "abc" active, "de" not shown yet
        terminal.navigate("glitchy");
        const old = terminal.getSnapshot().outgoing?.run;
        expect(old?.states).toEqual(["active", "ready"]);
        const frames: string[] = [];
        old?.subscribeFrame(1, (f) => frames.push(join(f)));
        expect(frames).toEqual([""]);
    });

    it("cuts a running transition short when navigating again", () => {
        const { terminal, ticker } = setup();
        terminal.navigate("plain");
        terminal.navigate("glitchy");
        const middle = terminal.getSnapshot().screen?.run;
        ticker.advance(50);
        terminal.navigate("glitchy");
        expect(terminal.getSnapshot().outgoing?.run).toBe(middle);
    });

    it("cuts without a transition by default, on the first screen, and when instant", () => {
        const { terminal } = setup();
        terminal.navigate("glitchy");
        expect(terminal.getSnapshot().outgoing).toBeNull();
        terminal.navigate("plain");
        expect(terminal.getSnapshot().outgoing).toBeNull();

        const instant = setup({ instant: true }).terminal;
        instant.navigate("plain");
        instant.navigate("glitchy");
        expect(instant.getSnapshot().outgoing).toBeNull();
    });

    it("finishes the transition when skipping", () => {
        const { terminal, ticker } = setup();
        terminal.navigate("plain");
        terminal.navigate("glitchy");
        terminal.skip();
        expect(terminal.getSnapshot().outgoing).toBeNull();
        expect(terminal.getSnapshot().screen?.states).toEqual(["done"]);
        expect(ticker.active).toBe(false);
    });

    it("stops the ticker only when both screens are finished", () => {
        const { terminal, ticker } = setup();
        terminal.navigate("plain");
        ticker.advance(100);
        terminal.navigate("slow"); // "slow" types in 40ms, the erase takes 300ms
        ticker.advance(100);
        expect(ticker.active).toBe(true);
        ticker.advance(200);
        expect(ticker.active).toBe(false);
    });
});
