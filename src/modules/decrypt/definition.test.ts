import { describe, expect, it } from "vitest";
import { seededRandom } from "../../engine/random.ts";
import type { Frame } from "../../engine/reveal/types.ts";
import { createDecryptReveal, type DecryptElement, decryptBar } from "./definition.ts";

const decrypt = (overrides: Partial<DecryptElement> = {}): DecryptElement => ({
    id: "x",
    type: "decrypt",
    text: "HELLO WORLD\nOK",
    duration: 1000,
    charset: "binary",
    order: "random",
    done: "COMPLETE",
    failed: "FAILED",
    ...overrides,
});
const reveal = (overrides: Partial<DecryptElement> = {}, instant = false) =>
    createDecryptReveal(decrypt(overrides), {
        columns: () => 30,
        memory: () => undefined,
        random: seededRandom(4),
        instant,
    });
const text = (frame: Frame) => frame.map((segment) => segment.text).join("");

describe("decrypt", () => {
    it("starts scrambled, keeping spaces and line breaks, and ends as the message", () => {
        const r = reveal();
        const start = text(r.frame(0));
        expect(start).toMatch(/^[01]{5} [01]{5}\n[01]{2}$/);
        const middle = text(r.frame(500));
        expect(middle).not.toBe(start);
        expect(middle).toHaveLength(start.length);
        expect(text(r.final())).toBe("HELLO WORLD\nOK");
        expect(r.duration).toBe(1000);
    });

    it("comes right from the start to the end, with sweep", () => {
        const r = reveal({ order: "sweep", charset: "#" + "%" });
        const shown = text(r.frame(600));
        const settled = [...shown].filter((c, i) => c === "HELLO WORLD\nOK"[i] && c !== " ");
        expect(settled.length).toBeGreaterThan(0);
        // what's come right is at the start
        expect(shown.startsWith("HEL")).toBe(true);
    });

    it("fails at failAt, leaving the rest scrambled", () => {
        const r = reveal({ failAt: 50, bar: "D " });
        expect(r.failed).toBe(true);
        expect(r.duration).toBe(500);
        const lines = text(r.final()).split("\n");
        const bar = lines.pop();
        const message = lines.join("\n");
        expect(message).not.toBe("HELLO WORLD\nOK");
        expect(bar).toMatch(/^D \[.*\] FAILED$/);
    });

    it("draws a bar that fills the line, with the percentage", () => {
        expect(decryptBar("D ", 50, 20)).toBe("D [██████░░░░░]  50%");
        expect(decryptBar("D ", 100, 20, "OK")).toBe("D [███████████] OK");
        expect(
            text(reveal({ bar: "D " }).final())
                .split("\n")
                .at(-1),
        ).toMatch(/\] COMPLETE$/);
        // room kept for the status, so the bar is the same width throughout
        const r = reveal({ bar: "D ", failAt: 50, failed: "DATA CORRUPT" });
        const width = (frame: Frame) => text(frame).split("\n").at(-1)?.indexOf("]");
        expect(width(r.frame(100))).toBe(width(r.final()));
    });

    it("is decrypted at once when everything shows at once", () => {
        expect(reveal({}, true).duration).toBe(0);
    });
});
