import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { generateJsonSchema, SCHEMA_PATH } from "./json-schema.ts";

it("schema/teletronix.schema.json is up to date (run `npm run gen:schema`)", () => {
    expect(readFileSync(SCHEMA_PATH, "utf8")).toBe(generateJsonSchema());
});
