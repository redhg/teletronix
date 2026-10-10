import { describe, expect, it } from "vitest";
import { CODE_LETTERS, cleanJoinCode, isJoinCode, newJoinCode, newSecret } from "./codes.ts";

describe("a join code", () => {
    it("is four consonants (no L), a dash, and four digits, and differs each time", () => {
        const codes = new Set<string>();
        for (let i = 0; i < 200; i++) {
            const code = newJoinCode();
            expect(code).toMatch(/^[BCDFGHJKMNPQRSTVWXYZ]{4}-\d{4}$/);
            expect(isJoinCode(code)).toBe(true);
            codes.add(code);
        }
        expect(codes.size).toBeGreaterThan(195);
        // (nothing that reads as a digit, or makes a word)
        expect(CODE_LETTERS).not.toMatch(/[AEIOUL]/);
        expect(CODE_LETTERS).toHaveLength(20);
    });

    it("is taken however it's typed: any case, spaces or dashes, and O or I among the digits", () => {
        expect(cleanJoinCode("bcdf-1234")).toBe("BCDF-1234");
        expect(cleanJoinCode(" b c d f 1 2 3 4 ")).toBe("BCDF-1234");
        expect(cleanJoinCode("bcdf12o4")).toBe("BCDF-1204");
        expect(cleanJoinCode("BCDF-I2L4")).toBe("BCDF-1214");
    });

    it("isn't anything else", () => {
        for (const typed of ["", "BCDF-123", "BCDF-12345", "ABCD-1234", "BCDL-1234", "1234-BCDF"]) {
            expect(cleanJoinCode(typed)).toBeNull();
        }
        // (exactly as written, only in its own form)
        expect(isJoinCode("bcdf-1234")).toBe(false);
        expect(isJoinCode("BCDF1234")).toBe(false);
    });
});

describe("a session's secret", () => {
    it("is long, random, and only letters and digits", () => {
        const secret = newSecret();
        expect(secret).toMatch(/^[a-z0-9]{28}$/);
        expect(newSecret()).not.toBe(secret);
    });
});
