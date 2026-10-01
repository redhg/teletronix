import { describe, expect, it } from "vitest";
import { createRuleReveal, type RuleElement, ruleLine } from "./definition.ts";

const rule = (overrides: Partial<RuleElement> = {}): RuleElement => ({
    id: "x",
    type: "rule",
    char: "─",
    labelAlign: "center",
    padding: 1,
    ...overrides,
});

describe("a rule", () => {
    it("fills the line, with a character or a pattern", () => {
        expect(ruleLine(rule(), 10)).toBe("──────────");
        expect(ruleLine(rule({ char: "-=" }), 7)).toBe("-=-=-=-");
        expect(ruleLine(rule({ cols: 4 }), 10)).toBe("────");
        // never wider than the screen
        expect(ruleLine(rule({ cols: 40 }), 6)).toBe("──────");
    });

    it("has a label set into it, centered or to one side", () => {
        expect(ruleLine(rule({ label: "LOG" }), 15)).toBe("───── LOG ─────");
        expect(ruleLine(rule({ label: "LOG", labelAlign: "left" }), 15)).toBe("── LOG ────────");
        expect(ruleLine(rule({ label: "LOG", labelAlign: "right" }), 15)).toBe("──────── LOG ──");
        expect(ruleLine(rule({ label: "LOG", padding: 0 }), 9)).toBe("───LOG───");
    });

    it("cuts a label short that doesn't fit, or leaves it out where nothing would", () => {
        expect(ruleLine(rule({ label: "CREW MANIFEST" }), 14)).toBe("── CREW MA~ ──");
        expect(ruleLine(rule({ label: "CREW" }), 6)).toBe("──────");
    });

    it("has ends", () => {
        expect(ruleLine(rule({ ends: ["├", "┤"] }), 6)).toBe("├────┤");
        expect(ruleLine(rule({ ends: ["<", ">"], label: "X", char: "=" }), 11)).toBe("<=== X ===>");
    });

    it("fits the width there is when it changes", () => {
        let columns = 8;
        const r = createRuleReveal(
            rule(),
            { type: "instant" },
            {
                columns: () => columns,
                memory: () => undefined,
            },
        );
        expect(r.final()[0]?.text).toBe("────────");
        columns = 4;
        expect(r.final()[0]?.text).toBe("────");
    });
});
