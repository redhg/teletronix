import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProgram } from "../src/engine/schema/program.ts";

const DATA_DIR = new URL("../public/data/", import.meta.url);
const files = readdirSync(DATA_DIR).filter((file) => file.endsWith(".json"));

describe("public/data", () => {
    it.each(files)("%s is a valid program", (file) => {
        const result = parseProgram(JSON.parse(readFileSync(new URL(file, DATA_DIR), "utf8")));
        expect(result.ok ? [] : result.errors).toEqual([]);
    });
});
