import { describe, expect, it } from "vitest";
import { idFor } from "./format.ts";

describe("a package's id", () => {
    it("is the same for the same contents, and differs for others", () => {
        const bytes = new TextEncoder().encode("PK… a package's bytes");
        expect(idFor(bytes)).toBe(idFor(new Uint8Array(bytes)));
        expect(idFor(bytes)).not.toBe(idFor(new TextEncoder().encode("PK… another's bytes")));
        expect(idFor("/Users/gm/heist.json")).toBe(idFor("/Users/gm/heist.json"));
        expect(idFor("/Users/gm/heist.json")).not.toBe(idFor("/Users/gm/heist2.json"));
    });

    it("is eleven letters and digits, fit for an address, saying nothing", () => {
        for (const content of ["", "x", "/Users/gm/The Heist.json"]) {
            expect(idFor(content)).toMatch(/^[0-9a-z]{11}$/);
        }
    });
});
