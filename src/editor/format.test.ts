import { describe, expect, it } from "vitest";
import written from "../../public/data/sample.json?raw";
import { formatJson } from "./format.ts";

const sample = JSON.parse(written) as unknown;

describe("formatJson", () => {
    it("keeps short and flat things on one line, and spreads long ones out", () => {
        expect(
            formatJson({
                config: { name: "T" },
                screens: {
                    home: {
                        content: [
                            "HELLO",
                            { type: "rule", char: "═" },
                            { type: "text", text: "x".repeat(120) },
                            {
                                type: "table",
                                rows: [
                                    ["RANK", "CAPTAIN"],
                                    ["ROLE", "x".repeat(60)],
                                ],
                            },
                        ],
                    },
                },
            }),
        ).toBe(`{
    "config": {
        "name": "T"
    },
    "screens": {
        "home": {
            "content": [
                "HELLO",
                { "type": "rule", "char": "═" },
                { "type": "text", "text": "${"x".repeat(120)}" },
                {
                    "type": "table",
                    "rows": [
                        ["RANK", "CAPTAIN"],
                        ["ROLE", "${"x".repeat(60)}"]
                    ]
                }
            ]
        }
    }
}
`);
    });

    it("writes the same program back, the same each time", () => {
        const once = formatJson(sample);
        expect(JSON.parse(once)).toEqual(sample);
        expect(formatJson(JSON.parse(once))).toBe(once);
    });

    it("keeps a big program about as compact as it's written by hand", () => {
        const lines = (text: string) => text.split("\n").length;
        expect(lines(formatJson(sample))).toBeLessThan(lines(written) * 1.2);
    });
});
