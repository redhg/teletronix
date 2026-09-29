import { describe, expect, it } from "vitest";
import { parseProgram } from "../../engine/schema/program.ts";
import { inRange, type NumberElement, numberAction, onlyDigits } from "./definition.ts";

const parse = (props: object, variables: object = { code: 0 }) =>
    parseProgram({
        config: { name: "T", variables },
        screens: {
            home: { content: [{ type: "number", ...props }] },
            open: { content: [] },
        },
        dialogs: { wrong: { type: "alert", content: "!" } },
    });

const keypad = (props: object = {}): NumberElement => {
    const result = parse({
        digits: 4,
        min: 1000,
        on: [
            { equals: 1138, action: { screen: "open" } },
            { atLeast: 9000, action: { dialog: "wrong" } },
        ],
        ...props,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.program.screens.get("home")?.content[0] as NumberElement;
};

describe("number", () => {
    it("keeps only digits, up to its length", () => {
        expect(onlyDigits(keypad(), "1a2-3.45")).toBe("1234");
    });

    it("runs the first rule a number meets, or else otherwise", () => {
        expect(numberAction(keypad(), 1138)).toEqual([{ screen: "open" }]);
        expect(numberAction(keypad(), 9999)).toEqual([{ dialog: "wrong" }]);
        expect(numberAction(keypad(), 5000)).toBeNull();
        expect(numberAction(keypad({ otherwise: { dialog: "wrong" } }), 5000)).toEqual([
            { dialog: "wrong" },
        ]);
    });

    it("turns away numbers outside min and max", () => {
        expect(inRange(keypad(), 999)).toBe(false);
        expect(numberAction(keypad({ otherwise: { dialog: "wrong" } }), 999)).toBeNull();
    });

    it("needs rules or otherwise, and a number variable", () => {
        const errors = (result: ReturnType<typeof parse>) =>
            result.ok ? [] : result.errors.map((error) => error.message);
        expect(errors(parse({}))).toEqual(['Give it "on" rules, "otherwise", or both']);
        expect(
            errors(parse({ otherwise: { screen: "open" }, variable: "code" }, { code: "" })),
        ).toEqual(["A number can only be bound to a number variable"]);
    });
});
