import { describe, expect, it } from "vitest";
import { parseProgram } from "../../engine/schema/program.ts";
import { inRange, type NumberElement, numberAction, onlyDigits, stepNumber } from "./definition.ts";

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

describe("the arrow keys", () => {
    it("step the number up and down", () => {
        const pad = keypad();
        expect(stepNumber(pad, "1200", 1)).toBe("1201");
        expect(stepNumber(pad, "1200", -10)).toBe("1190");
        expect(stepNumber(keypad({ step: 25 }), "1200", 1)).toBe("1225");
    });

    it("stay within min, max and the digits it takes", () => {
        const pad = keypad();
        expect(stepNumber(pad, "1005", -10)).toBe("1000");
        expect(stepNumber(pad, "9995", 10)).toBe("9999");
        expect(stepNumber(keypad({ max: 1500 }), "1499", 10)).toBe("1500");
        // never below 0, which is as low as digits go
        expect(stepNumber(keypad({ min: undefined }), "3", -10)).toBe("0");
    });

    it("start from the lowest number going up, and the highest going down", () => {
        expect(stepNumber(keypad(), "", 1)).toBe("1000");
        expect(stepNumber(keypad({ max: 5000 }), "", -1)).toBe("5000");
        // with no max, down starts low too, rather than at 9999
        expect(stepNumber(keypad(), "", -1)).toBe("1000");
    });
});
