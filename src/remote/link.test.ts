import { describe, expect, it } from "vitest";
import { CODE_LENGTH, cleanCode, newCode } from "./link.ts";
import { badgeText } from "./RemoteBadge.tsx";

describe("pairing codes", () => {
    it("are short, and never use letters easy to mix up", () => {
        for (let i = 0; i < 200; i++) {
            const code = newCode();
            expect(code).toHaveLength(CODE_LENGTH);
            expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
        }
    });

    it("are read as typed, in any case, without spaces", () => {
        expect(cleanCode(" k7-qx ")).toBe("K7QX");
    });

    it("show on the terminal with whether a GM is connected", () => {
        const code = "K7QX";
        expect(badgeText({ code, network: "connecting", gm: false })).toBe(
            "REMOTE K7QX · CONNECTING…",
        );
        expect(badgeText({ code, network: "connected", gm: false })).toBe(
            "REMOTE K7QX · WAITING FOR GM",
        );
        expect(badgeText({ code, network: "connected", gm: true })).toBe(
            "REMOTE K7QX · GM CONNECTED",
        );
        expect(badgeText({ code, network: "unavailable", gm: false })).toMatch(/UNAVAILABLE/);
    });
});
