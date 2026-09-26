// Writes schema/teletronix.schema.json. Run with `npm run gen:schema`.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateJsonSchema, SCHEMA_PATH } from "./json-schema.ts";

writeFileSync(SCHEMA_PATH, generateJsonSchema());
console.log(`Wrote ${fileURLToPath(SCHEMA_PATH)}`);
