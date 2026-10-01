import { describe, expect, it } from "vitest";
import type { ScreenRun } from "../../engine/runtime/screen-run.ts";
import { createTestTerminal } from "../../engine/runtime/test-helpers.ts";
import { ActionSchema } from "../../engine/schema/common.ts";
import { parseProgram, type TeletronixFile } from "../../engine/schema/program.ts";
import { type CarouselElement, counterText, currentSlide, stepSlide } from "./definition.ts";

// teletype at 10ms a character
const FILE: TeletronixFile = {
    config: { name: "Test", variables: { page: 1 } },
    screens: {
        home: {
            content: [
                { type: "carousel", slides: [["one"], ["two", "2b"], ["three"]] },
                "end",
                { type: "carousel", variable: "page", slides: [["a"], ["b"]] },
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

const carousel = (overrides: Partial<CarouselElement> = {}) => {
    const result = parseProgram({
        config: { name: "T" },
        screens: { home: { content: [{ type: "carousel", slides: [[], [], []] }] } },
    });
    if (!result.ok) throw new Error("invalid");
    const element = result.program.screens.get("home")?.content[0] as CarouselElement;
    return { ...element, ...overrides };
};

describe("carousels", () => {
    it("give their slides' elements ids, and check them with paths into the slides", () => {
        const result = parseProgram(FILE);
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        const element = result.program.screens.get("home")?.content[0];
        expect(
            element?.type === "carousel" && element.slides.map((s) => s.map((e) => e.id)),
        ).toEqual([["home#0.0.0"], ["home#0.1.0", "home#0.1.1"], ["home#0.2.0"]]);

        const bad = parseProgram({
            config: { name: "T" },
            screens: {
                home: {
                    content: [
                        {
                            type: "carousel",
                            slides: [[], [{ type: "link", text: "x", action: { screen: "nope" } }]],
                        },
                    ],
                },
            },
        });
        expect(bad.ok ? [] : bad.errors).toEqual([
            { path: "screens.home.content[0].slides[1][0]", message: 'Unknown screen "nope"' },
        ]);
    });

    it("step between slides, stopping at the ends unless they loop", () => {
        expect(stepSlide(carousel(), 0, -1)).toBeNull();
        expect(stepSlide(carousel(), 0, 1)).toBe(1);
        expect(stepSlide(carousel(), 2, 1)).toBeNull();
        expect(stepSlide(carousel({ loop: true }), 2, 1)).toBe(0);
        expect(stepSlide(carousel({ loop: true }), 0, -1)).toBe(2);
        expect(currentSlide(carousel({ start: 2 }), undefined)).toBe(1);
        expect(currentSlide(carousel(), 7)).toBe(2);
        expect(counterText(carousel(), 1)).toBe("2/3");
        expect(counterText(carousel({ counter: "PAGE {slide} OF {slides}" }), 0)).toBe(
            "PAGE 1 OF 3",
        );
        expect(counterText(carousel({ counter: false }), 0)).toBe("");
    });

    it("reveal their slide before the screen carries on", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.start();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        ticker.advance(20, 10);
        const slide = run.contents("home#0") as ScreenRun;
        expect(slide.elements.map((e) => e.id)).toEqual(["home#0.0.0"]);
        expect(text(run, 1)).toBe("");
        ticker.advance(100, 10);
        expect(text(slide, 0)).toBe("one");
        expect(text(run, 1)).toBe("end");
    });

    it("reveal the new slide when flipped, and remember it", () => {
        const { terminal, ticker } = createTestTerminal(FILE);
        terminal.start();
        terminal.skip();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;

        terminal.remember("home#0", 1);
        const slide = run.contents("home#0") as ScreenRun;
        expect(slide.elements.map((e) => e.id)).toEqual(["home#0.1.0", "home#0.1.1"]);
        expect(slide.finishedAt).toBeNull();
        ticker.advance(100, 10);
        expect(text(slide, 0)).toBe("two");
        expect(text(slide, 1)).toBe("2b");

        // the same slide again changes nothing
        terminal.remember("home#0", 1);
        expect(run.contents("home#0")).toBe(slide);
    });

    it("flip with their variable, which counts from 1", () => {
        const { terminal } = createTestTerminal(FILE);
        terminal.start();
        terminal.skip();
        const run = terminal.getSnapshot().screen?.run as ScreenRun;
        expect((run.contents("home#2") as ScreenRun).elements.map((e) => e.id)).toEqual([
            "home#2.0.0",
        ]);

        terminal.remember("home#2", 1);
        expect(terminal.variable("page")).toBe(2);
        terminal.dispatch(ActionSchema.parse({ set: { page: 1 } }));
        terminal.skip();
        expect((run.contents("home#2") as ScreenRun).elements.map((e) => e.id)).toEqual([
            "home#2.0.0",
        ]);
    });

    it("check their variable", () => {
        const result = parseProgram({
            config: { name: "T", variables: { page: 5, name: "X" } },
            screens: {
                home: {
                    content: [
                        { type: "carousel", variable: "page", slides: [[], []] },
                        { type: "carousel", variable: "name", slides: [[]] },
                    ],
                },
            },
        });
        expect(result.ok ? [] : result.errors.map((error) => error.message)).toEqual([
            "The variable must start between 1 and 2",
            "A carousel can only be bound to a number",
        ]);
    });
});
