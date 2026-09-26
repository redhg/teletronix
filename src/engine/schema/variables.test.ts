import { describe, expect, it } from "vitest";
import { parseProgram, type TeletronixFile } from "./program.ts";
import {
    assign,
    type Condition,
    ConditionSchema,
    format,
    holds,
    type VariableValue,
} from "./variables.ts";

const condition = (input: unknown) => ConditionSchema.parse(input);
const read = (values: Record<string, VariableValue>) => (name: string) => values[name];

describe("conditions", () => {
    it("normalize a variable's value, or a test of it", () => {
        expect(condition({ keycard: true })).toEqual({ variable: "keycard", equals: true });
        expect(condition({ power: { atLeast: 90 } })).toEqual({ variable: "power", atLeast: 90 });
        expect(condition({ keycard: true, power: { atMost: 5 } })).toEqual({
            all: [
                { variable: "keycard", equals: true },
                { variable: "power", atMost: 5 },
            ],
        });
    });

    it("nest", () => {
        expect(condition({ not: { any: [{ a: 1 }, { all: [{ b: "x" }] }] } })).toEqual({
            not: {
                any: [{ variable: "a", equals: 1 }, { all: [{ variable: "b", equals: "x" }] }],
            },
        });
    });

    it("reject what isn't a condition", () => {
        expect(ConditionSchema.safeParse({}).success).toBe(false);
        expect(ConditionSchema.safeParse({ all: [] }).success).toBe(false);
        expect(ConditionSchema.safeParse({ power: { above: 5 } }).success).toBe(false);
        expect(ConditionSchema.safeParse({ power: {} }).success).toBe(false);
    });

    it("hold or not", () => {
        const values = read({ keycard: true, power: 40, name: "Ada" });
        const check = (input: unknown) => holds(condition(input) as Condition, values);
        expect(check({ keycard: true })).toBe(true);
        expect(check({ keycard: false })).toBe(false);
        expect(check({ power: { atLeast: 40 } })).toBe(true);
        expect(check({ power: { atLeast: 41 } })).toBe(false);
        expect(check({ power: { atLeast: 10, atMost: 39 } })).toBe(false);
        expect(check({ keycard: true, power: 40 })).toBe(true);
        expect(check({ any: [{ keycard: false }, { power: 40 }] })).toBe(true);
        expect(check({ not: { keycard: true } })).toBe(false);
        expect(check({ unknown: true })).toBe(false);
    });

    it("compare text ignoring case and outer spaces", () => {
        const values = read({ password: " SwordFish " });
        expect(holds(condition({ password: "swordfish" }), values)).toBe(true);
        expect(holds(condition({ password: "sword fish" }), values)).toBe(false);
    });
});

describe("assignments", () => {
    it("set a value, or add to a number", () => {
        expect(assign({ variable: "a", value: "x" }, "y")).toBe("x");
        expect(assign({ variable: "a", add: -3 }, 10)).toBe(7);
    });
});

describe("format", () => {
    it("fills in declared variables, and leaves other braces alone", () => {
        const values = read({ name: "Ada", credits: 12, on: false });
        expect(format("Hi {name}, {credits} credits, on: {on}", values)).toBe(
            "Hi Ada, 12 credits, on: false",
        );
        expect(format("{nope} { name } {{name}} {", values)).toBe("{nope} { name } {Ada} {");
    });
});

describe("checks when parsing", () => {
    const parse = (screen: object, variables: object = { keycard: false, power: 40, name: "" }) => {
        const file = {
            config: { name: "Test", variables },
            screens: { home: screen, next: { content: [] } },
        } as TeletronixFile;
        const result = parseProgram(file);
        return result.ok ? [] : result.errors;
    };

    it("accept variables used as declared", () => {
        expect(
            parse({
                next: { key: "x", if: { keycard: true }, action: { screen: "next" } },
                content: [
                    { type: "text", text: "Hi {name}", if: { power: { atLeast: 5 } } },
                    {
                        type: "link",
                        text: "> GO",
                        action: [
                            { if: { keycard: true }, screen: "next", set: { power: { add: 1 } } },
                            { set: { name: "x", keycard: true } },
                        ],
                    },
                    { type: "toggle", states: ["OFF", "ON"], variable: "keycard" },
                    { type: "slider", variable: "power" },
                    { type: "prompt", variable: "name", onEnter: { screen: "next" } },
                ],
            }),
        ).toEqual([]);
    });

    it("reject names that can't be variables", () => {
        expect(parse({ content: [] }, { all: 1 })).toEqual([
            {
                path: "config.variables.all",
                message: '"all", "any" and "not" can\'t be variable names',
            },
        ]);
    });

    it("report unknown variables and mismatched types, wherever they're used", () => {
        expect(
            parse({
                next: { key: "x", if: { nope: true }, action: { screen: "next" } },
                content: [
                    { type: "text", text: "x", if: { power: "high" } },
                    { type: "text", text: "x", if: { keycard: { atLeast: 1 } } },
                    {
                        type: "link",
                        text: "x",
                        action: { set: { keycard: 1, name: { add: 1 }, other: 2 } },
                    },
                ],
            }),
        ).toEqual([
            {
                path: "screens.home.next[0].if",
                message: 'Unknown variable "nope" (declare it in config.variables)',
            },
            {
                path: "screens.home.content[0].if",
                message: '"power" is a number, so it can\'t equal "high"',
            },
            {
                path: "screens.home.content[1].if",
                message: '"keycard" is true or false; only numbers have "atLeast" and "atMost"',
            },
            {
                path: "screens.home.content[2]",
                message: '"keycard" is true or false, so it can\'t be set to 1',
            },
            {
                path: "screens.home.content[2]",
                message: '"name" is text; only numbers can be added to',
            },
            {
                path: "screens.home.content[2]",
                message: 'Unknown variable "other" (declare it in config.variables)',
            },
        ]);
    });

    it("check what an element is bound to", () => {
        const errors = parse({
            content: [
                { type: "toggle", states: ["A", "B", "C"], variable: "keycard" },
                { type: "toggle", states: ["A", "B"], variable: "keycard", initial: 1 },
                { type: "slider", max: 10, variable: "power" },
                { type: "prompt", variable: "power", onEnter: { screen: "next" } },
                { type: "slider", variable: "missing" },
            ],
        }).map((error) => error.message);
        expect(errors).toEqual([
            "A toggle bound to true or false needs exactly two states",
            'A toggle with a "variable" starts from its value; remove "initial"',
            "The variable must start between 0 and 10",
            "A prompt can only be bound to a text variable",
            'Unknown variable "missing" (declare it in config.variables)',
        ]);
    });

    it("need a prompt to have commands or onEnter", () => {
        expect(parse({ content: [{ type: "prompt" }] })).toEqual([
            {
                path: "screens.home.content[0]",
                message: 'Give the prompt "commands", "onEnter", or both',
            },
        ]);
    });
});
