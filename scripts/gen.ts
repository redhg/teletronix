// Writes the files generated from the schema. Run with `npm run gen`.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateJsonSchema, SCHEMA_PATH } from "./json-schema.ts";
import { generateReference } from "./reference.ts";

export const REFERENCE_PATH = new URL("../docs/reference.md", import.meta.url);

writeFileSync(SCHEMA_PATH, generateJsonSchema());
console.log(`Wrote ${fileURLToPath(SCHEMA_PATH)}`);

const { markdown, missing } = generateReference();
mkdirSync(new URL("../docs/", import.meta.url), { recursive: true });
writeFileSync(REFERENCE_PATH, markdown);
console.log(`Wrote ${fileURLToPath(REFERENCE_PATH)}`);
if (missing.length) console.warn(`Missing descriptions:\n  ${missing.join("\n  ")}`);
