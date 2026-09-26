import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { generateReference } from "./reference.ts";

const REFERENCE_PATH = new URL("../docs/reference.md", import.meta.url);

it("docs/reference.md is up to date (run `npm run gen`)", () => {
    expect(readFileSync(REFERENCE_PATH, "utf8")).toBe(generateReference().markdown);
});

it("every type and property in the reference has a description", () => {
    expect(generateReference().missing).toEqual([]);
});
