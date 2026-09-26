import { z } from "zod";
import { FileSchema } from "../src/engine/schema/program.ts";

export const SCHEMA_PATH = new URL("../schema/teletronix.schema.json", import.meta.url);

/** The JSON Schema for Teletronix files, for editor validation and autocomplete. */
export function generateJsonSchema(): string {
    const schema = z.toJSONSchema(FileSchema, { io: "input", target: "draft-2020-12" });
    return `${JSON.stringify(schema, null, 4)}\n`;
}
