import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProgram } from "../src/engine/schema/program.ts";

const DATA_DIR = new URL("../public/data/", import.meta.url);
const files = readdirSync(DATA_DIR).filter((file) => file.endsWith(".json"));

/**
 * Keys that appear twice in the same object. JSON.parse quietly keeps the last, so a second
 * screen with the same id replaces the first without a word.
 */
function duplicateKeys(json: string): string[] {
    const duplicates: string[] = [];
    // the keys seen in each object we're inside (null for an array)
    const stack: (Set<string> | null)[] = [];
    let i = 0;
    while (i < json.length) {
        const char = json[i];
        if (char === '"') {
            // a string: read it, then see whether it's a key (followed by a colon)
            let end = i + 1;
            while (end < json.length && json[end] !== '"') end += json[end] === "\\" ? 2 : 1;
            const text = JSON.parse(json.slice(i, end + 1)) as string;
            let next = end + 1;
            while (/\s/.test(json[next] ?? "")) next++;
            const keys = stack.at(-1);
            if (json[next] === ":" && keys) {
                if (keys.has(text)) duplicates.push(text);
                keys.add(text);
            }
            i = end + 1;
            continue;
        }
        if (char === "{") stack.push(new Set());
        else if (char === "[") stack.push(null);
        else if (char === "}" || char === "]") stack.pop();
        i++;
    }
    return duplicates;
}

describe("public/data", () => {
    it.each(files)("%s is a valid program", (file) => {
        const result = parseProgram(JSON.parse(readFileSync(new URL(file, DATA_DIR), "utf8")));
        expect(result.ok ? [] : result.errors).toEqual([]);
    });

    it.each(files)("%s has no key twice in one place (e.g. two screens with one id)", (file) => {
        expect(duplicateKeys(readFileSync(new URL(file, DATA_DIR), "utf8"))).toEqual([]);
    });

    it("finds keys given twice", () => {
        expect(duplicateKeys('{"a": 1, "b": {"a": 2}, "a": 3, "c": ["a", "a"]}')).toEqual(["a"]);
        expect(duplicateKeys('{"x": "say \\"x\\":", "y": 1}')).toEqual([]);
    });
});
