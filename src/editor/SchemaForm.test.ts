import { describe, expect, it } from "vitest";
import { ScreenSchema } from "../engine/schema/program.ts";
import { choiceValue, jsonSchemaOf, namedChoices } from "./SchemaForm.tsx";
import { ELEMENT_TYPES } from "./screens.ts";

const screen = jsonSchemaOf(ScreenSchema);
const defs = screen.$defs ?? {};
const property = (name: string) => screen.properties?.[name] ?? {};

describe("named kinds in the editor's forms", () => {
    it("are found in a screen's reveal and transition", () => {
        const reveal = namedChoices(property("reveal"), defs);
        expect(reveal?.names).toEqual(["teletype", "glitch", "instant"]);
        expect(reveal?.objects.get("teletype")?.properties).toHaveProperty("speed");
        expect(namedChoices(property("transition"), defs)?.names).toEqual([
            "none",
            "glitch",
            "fade",
            "static",
        ]);
    });

    it("aren't found where there's no such choice", () => {
        for (const name of ["header", "next", "parent", "title", "align", "content"]) {
            expect(namedChoices(property(name), defs)).toBeNull();
        }
    });

    it("are written as just the name, until an option is set", () => {
        const reveal = namedChoices(property("reveal"), defs);
        if (!reveal) throw new Error("no choices");
        expect(choiceValue(reveal, "teletype", {})).toBe("teletype");
        expect(choiceValue(reveal, "teletype", { speed: undefined })).toBe("teletype");
        expect(choiceValue(reveal, "teletype", { speed: 20 })).toEqual({
            type: "teletype",
            speed: 20,
        });
    });

    it("are found in every element's reveal", () => {
        for (const { type, schema } of ELEMENT_TYPES) {
            const json = jsonSchemaOf(schema);
            const reveal = json.properties?.reveal;
            if (reveal) expect(namedChoices(reveal, json.$defs ?? {}), type).not.toBeNull();
        }
    });
});
