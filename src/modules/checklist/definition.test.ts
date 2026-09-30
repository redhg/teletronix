import { describe, expect, it } from "vitest";
import type { Frame } from "../../engine/reveal/types.ts";
import { type ChecklistElement, checklistLine, createChecklistReveal } from "./definition.ts";

const checklist = (overrides: Partial<ChecklistElement> = {}): ChecklistElement => ({
    id: "x",
    type: "checklist",
    items: ["AB", "CD"],
    status: "[OK]",
    delay: 100,
    leader: ".",
    ...overrides,
});

const text = (frame: Frame, kind?: string) =>
    frame
        .filter((segment) => kind === undefined || segment.kind === kind)
        .map((segment) => segment.text)
        .join("");

// typing at 10ms a character, in 12 columns, with no variation in the delays
const reveal = (overrides: Partial<ChecklistElement> = {}, instant = false) =>
    createChecklistReveal(
        checklist(overrides),
        { type: "teletype", speed: 10 },
        { columns: () => 12, memory: () => undefined, random: () => 0.5, instant },
    );

describe("checklistLine", () => {
    it("fills the gap with the leader, so the status ends at the width", () => {
        expect(checklistLine({ text: "AB", status: "[OK]" }, ".", 12)).toBe("AB .... [OK]");
        expect(checklistLine({ text: "AB", status: "[OK]" }, " ", 12)).toBe("AB      [OK]");
    });

    it("puts a line that doesn't fit next to its status, and one without a status alone", () => {
        expect(checklistLine({ text: "ABCDEFGH", status: "[OK]" }, ".", 12)).toBe("ABCDEFGH [OK]");
        expect(checklistLine({ text: "AB", status: "" }, ".", 12)).toBe("AB");
    });
});

describe("checklist", () => {
    it("types each line, waits with the cursor at its end, then shows its status", () => {
        const r = reveal();
        // two lines of 2 characters, each followed by 100ms
        expect(r.duration).toBe(240);
        expect(text(r.frame(10), "visible")).toBe("A");
        // waiting: the line is typed, and the cursor sits after it
        expect(text(r.frame(50), "visible")).toBe("AB");
        expect(text(r.frame(50), "cursor")).toBe(" ");
        // the status arrived, and the next line is typing
        expect(text(r.frame(130), "visible")).toBe("AB .... [OK]\nC");
        // the whole text is always there, the rest hidden, so nothing moves
        for (const t of [0, 50, 130, 239]) {
            expect(text(r.frame(t))).toBe("AB .... [OK]\nCD .... [OK]");
        }
        expect(text(r.final())).toBe("AB .... [OK]\nCD .... [OK]");
    });

    it("varies the delays, unless an item sets its own", () => {
        const short = createChecklistReveal(
            checklist(),
            { type: "instant" },
            { columns: () => 12, memory: () => undefined, random: () => 0 },
        );
        const long = createChecklistReveal(
            checklist(),
            { type: "instant" },
            { columns: () => 12, memory: () => undefined, random: () => 0.999 },
        );
        expect(short.duration).toBe(100);
        expect(long.duration).toBeCloseTo(300, 0);
        const exact = reveal({ items: [{ text: "AB", delay: 500 }] });
        expect(exact.duration).toBe(520);
    });

    it("gives items their own status, and can end the statuses before the edge", () => {
        const r = reveal({ items: ["AB", { text: "CD", status: "NO" }], width: 8 });
        expect(text(r.final())).toBe("AB [OK]\nCD .. NO");
    });

    it("lays itself out to the screen's width as it changes", () => {
        let columns = 12;
        const r = createChecklistReveal(
            checklist(),
            { type: "instant" },
            { columns: () => columns, memory: () => undefined, random: () => 0.5 },
        );
        columns = 14;
        expect(text(r.final())).toBe("AB ...... [OK]\nCD ...... [OK]");
    });

    it("doesn't wait at all when everything shows at once", () => {
        expect(reveal({}, true).duration).toBe(0);
    });
});
