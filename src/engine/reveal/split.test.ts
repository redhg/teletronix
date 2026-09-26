import { describe, expect, it } from "vitest";
import { splitFrame } from "./split.ts";

describe("splitFrame", () => {
    it("splits a frame over texts joined by one-character separators", () => {
        // "ab" + "\n" + "" + "\n" + "cde"
        const frame = [
            { kind: "visible" as const, text: "ab\n\nc" },
            { kind: "cursor" as const, text: "d" },
            { kind: "hidden" as const, text: "e" },
        ];
        expect(splitFrame(frame, [2, 0, 3])).toEqual([
            [{ kind: "visible", text: "ab" }],
            [],
            [
                { kind: "visible", text: "c" },
                { kind: "cursor", text: "d" },
                { kind: "hidden", text: "e" },
            ],
        ]);
    });
});
