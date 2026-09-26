import { z } from "zod";

// ─── Variables ───────────────────────────────────────────────────────────────
// Named values a program keeps while it runs: true/false, a number, or text. Actions set
// them, toggles, sliders and prompts can be bound to them, conditions test them, and text
// shows them as {name}.

export type VariableValue = boolean | number | string;
export type VariableType = "boolean" | "number" | "string";

/** Words with a meaning of their own in a condition, so they can't name a variable. */
const RESERVED = new Set(["all", "any", "not"]);

export const VariableNameSchema = z
    .string()
    .regex(
        /^[A-Za-z_][A-Za-z0-9_-]*$/,
        "Variable names start with a letter or '_', then letters, digits, '_' and '-'",
    )
    .refine((name) => !RESERVED.has(name), {
        message: '"all", "any" and "not" can\'t be variable names',
    })
    .meta({ description: "A variable declared in config.variables" });

export const VariableValueSchema = z
    .union([z.boolean(), z.number(), z.string()])
    .meta({ description: "true or false, a number, or text" });

export const VariablesSchema = z.record(VariableNameSchema, VariableValueSchema).meta({
    description:
        "The program's variables and their starting values: true or false, a number, or text. " +
        "Actions change them with `set`, toggles, sliders and prompts can be bound to them, " +
        '`if` tests them, and text shows them as "{name}". They reset when the page reloads.',
});

export const typeOf = (value: VariableValue): VariableType =>
    typeof value as "boolean" | "number" | "string";

// ─── Conditions ──────────────────────────────────────────────────────────────

export const ComparisonSchema = z
    .strictObject({
        equals: VariableValueSchema.optional().meta({
            description: "Exactly this value (text is compared ignoring case and outer spaces)",
        }),
        atLeast: z.number().optional().meta({ description: "This number or more" }),
        atMost: z.number().optional().meta({ description: "This number or less" }),
    })
    .refine(
        (test) =>
            test.equals !== undefined || test.atLeast !== undefined || test.atMost !== undefined,
        { message: 'Set "equals", "atLeast" or "atMost" (or a combination)' },
    )
    .meta({
        description:
            "A test of one variable's value. Set more than one and the value must pass them all.",
    });

/** A condition, normalized. */
export type Condition =
    | { all: Condition[] }
    | { any: Condition[] }
    | { not: Condition }
    | { variable: string; equals?: VariableValue; atLeast?: number; atMost?: number };

type Comparison = { equals?: VariableValue; atLeast?: number; atMost?: number };

/** A condition as written in a program. */
export type ConditionInput =
    | { all: ConditionInput[] }
    | { any: ConditionInput[] }
    | { not: ConditionInput }
    | { [variable: string]: VariableValue | Comparison };

export const VariableTestsSchema = z
    .record(VariableNameSchema, z.union([VariableValueSchema, ComparisonSchema]))
    .refine((tests) => Object.keys(tests).length > 0, { message: "Name at least one variable" })
    .meta({
        description:
            'Variables and what they must be: a value, e.g. { "keycard": true }, or a test, e.g. ' +
            '{ "power": { "atLeast": 90 } }. With several, every one must pass.',
    });

export const ConditionSchema: z.ZodType<Condition, ConditionInput> = z
    .lazy(() =>
        z.union([
            AllConditionSchema,
            AnyConditionSchema,
            NotConditionSchema,
            VariableTestsSchema.transform(fromTests),
        ]),
    )
    .meta({
        // named, so the JSON Schema can refer to it from inside itself
        id: "Condition",
        description:
            'A test of the variables: { "keycard": true }, { "power": { "atLeast": 90 } }, or ' +
            '{ "all": [ … ] }, { "any": [ … ] } or { "not": … } to combine them',
    });

export const AllConditionSchema = z
    .strictObject({
        all: z.array(ConditionSchema).min(1).meta({ description: "Conditions that must all hold" }),
    })
    .meta({ description: "Holds when every condition in it does" });
export const AnyConditionSchema = z
    .strictObject({
        any: z
            .array(ConditionSchema)
            .min(1)
            .meta({ description: "Conditions of which at least one must hold" }),
    })
    .meta({ description: "Holds when at least one condition in it does" });
export const NotConditionSchema = z
    .strictObject({
        not: ConditionSchema.meta({ description: "The condition that must not hold" }),
    })
    .meta({ description: "Holds when the condition in it doesn't" });

function fromTests(tests: Record<string, VariableValue | Comparison>): Condition {
    const conditions = Object.entries(tests).map(
        ([variable, test]): Condition =>
            typeof test === "object" ? { variable, ...test } : { variable, equals: test },
    );
    return conditions.length === 1 ? (conditions[0] as Condition) : { all: conditions };
}

const same = (a: VariableValue, b: VariableValue) =>
    typeof a === "string" && typeof b === "string"
        ? a.trim().toLowerCase() === b.trim().toLowerCase()
        : a === b;

/** Whether a condition holds, reading the variables with `read`. */
export function holds(
    condition: Condition,
    read: (variable: string) => VariableValue | undefined,
): boolean {
    if ("all" in condition) return condition.all.every((c) => holds(c, read));
    if ("any" in condition) return condition.any.some((c) => holds(c, read));
    if ("not" in condition) return !holds(condition.not, read);

    const value = read(condition.variable);
    if (value === undefined) return false;
    if (condition.equals !== undefined && !same(value, condition.equals)) return false;
    if (
        condition.atLeast !== undefined &&
        !(typeof value === "number" && value >= condition.atLeast)
    )
        return false;
    if (condition.atMost !== undefined && !(typeof value === "number" && value <= condition.atMost))
        return false;
    return true;
}

/** Problems with a condition, given the declared variables: unknown names, wrong types. */
export function checkCondition(
    condition: Condition,
    variables: ReadonlyMap<string, VariableValue>,
): string[] {
    if ("all" in condition) return condition.all.flatMap((c) => checkCondition(c, variables));
    if ("any" in condition) return condition.any.flatMap((c) => checkCondition(c, variables));
    if ("not" in condition) return checkCondition(condition.not, variables);

    const { variable, equals, atLeast, atMost } = condition;
    const declared = variables.get(variable);
    if (declared === undefined) return [unknownVariable(variable)];
    const type = typeOf(declared);
    const problems: string[] = [];
    if (equals !== undefined && typeOf(equals) !== type) {
        problems.push(
            `"${variable}" is ${article(type)}, so it can't equal ${JSON.stringify(equals)}`,
        );
    }
    if ((atLeast !== undefined || atMost !== undefined) && type !== "number") {
        problems.push(
            `"${variable}" is ${article(type)}; only numbers have "atLeast" and "atMost"`,
        );
    }
    return problems;
}

export const unknownVariable = (name: string) =>
    `Unknown variable "${name}" (declare it in config.variables)`;

export const article = (type: VariableType) =>
    ({ boolean: "true or false", number: "a number", string: "text" })[type];

// ─── Assignments ─────────────────────────────────────────────────────────────

export const AddSchema = z
    .strictObject({
        add: z.number().meta({ description: "How much to add (negative to subtract)" }),
    })
    .meta({ description: "Adds to a number variable" });

export const AssignmentsSchema = z
    .record(VariableNameSchema, z.union([VariableValueSchema, AddSchema]))
    .transform((set) =>
        Object.entries(set).map(
            ([variable, change]): Assignment =>
                typeof change === "object"
                    ? { variable, add: change.add }
                    : { variable, value: change },
        ),
    )
    .meta({
        description:
            'Variables to change, and their new values, e.g. { "keycard": true }, or ' +
            '{ "credits": { "add": -10 } } to add to a number',
    });

export type Assignment =
    | { variable: string; value: VariableValue }
    | { variable: string; add: number };

/** A variable's value after an assignment. */
export function assign(assignment: Assignment, current: VariableValue | undefined): VariableValue {
    if ("value" in assignment) return assignment.value;
    return (typeof current === "number" ? current : 0) + assignment.add;
}

/** Problems with assignments, given the declared variables. */
export function checkAssignments(
    assignments: readonly Assignment[],
    variables: ReadonlyMap<string, VariableValue>,
): string[] {
    return assignments.flatMap((assignment) => {
        const declared = variables.get(assignment.variable);
        if (declared === undefined) return [unknownVariable(assignment.variable)];
        const type = typeOf(declared);
        if ("add" in assignment) {
            return type === "number"
                ? []
                : [`"${assignment.variable}" is ${article(type)}; only numbers can be added to`];
        }
        return typeOf(assignment.value) === type
            ? []
            : [
                  `"${assignment.variable}" is ${article(type)}, so it can't be set to ${JSON.stringify(assignment.value)}`,
              ];
    });
}

// ─── Text ────────────────────────────────────────────────────────────────────

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_-]*)\}/g;

/** Replaces {name} with the variable's value, for declared variables only. */
export function format(
    text: string,
    read: (variable: string) => VariableValue | undefined,
): string {
    if (!text.includes("{")) return text;
    return text.replace(PLACEHOLDER, (placeholder, name: string) => {
        const value = read(name);
        return value === undefined ? placeholder : String(value);
    });
}
