import { describe, expect, it } from "vitest";
import { parseProgram } from "../../engine/schema/program.ts";
import { deniedMessage, isLocked, type LoginElement, loginAction } from "./definition.ts";

const parse = (login: object, variables: object = {}) =>
    parseProgram({
        config: { name: "T", variables },
        screens: {
            home: { content: [{ type: "login", ...login }] },
            inside: { content: [] },
            admin: { content: [] },
        },
    });

const login = (props: object = {}): LoginElement => {
    const result = parse({
        accounts: [
            { user: "Ripley", password: "Jonesy" },
            { user: "ash", password: "937", action: { screen: "admin" } },
        ],
        action: { screen: "inside" },
        ...props,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.program.screens.get("home")?.content[0] as LoginElement;
};

describe("login", () => {
    it("logs in with a username (any case) and its password (exactly)", () => {
        expect(loginAction(login(), " RIPLEY ", "Jonesy")).toEqual([{ screen: "inside" }]);
        expect(loginAction(login(), "ripley", "jonesy")).toBeNull();
        expect(loginAction(login(), "ripley", "937")).toBeNull();
        expect(loginAction(login(), "ash", "937")).toEqual([{ screen: "admin" }]);
    });

    it("can take a password only", () => {
        const pin = login({ username: false, accounts: [{ password: "1138" }] });
        expect(loginAction(pin, "", "1138")).toEqual([{ screen: "inside" }]);
    });

    it("counts down the tries left, then locks", () => {
        const limited = login({ attempts: 3 });
        expect(deniedMessage(limited, 1)).toBe("ACCESS DENIED. 2 ATTEMPTS REMAINING.");
        expect(isLocked(limited, 2)).toBe(false);
        expect(deniedMessage(limited, 3)).toBe("TOO MANY ATTEMPTS. TERMINAL LOCKED.");
        expect(isLocked(limited, 3)).toBe(true);
        expect(deniedMessage(login(), 9)).toBe("ACCESS DENIED.");
        expect(isLocked(login(), 99)).toBe(false);
    });

    it("needs a user for each account, and an action for each", () => {
        const noUser = parse({ accounts: [{ password: "x" }], action: { screen: "inside" } });
        expect(noUser.ok).toBe(false);
        const noAction = parse({ accounts: [{ user: "a", password: "x" }] });
        expect(noAction.ok).toBe(false);
    });

    it("checks its variable is a text variable", () => {
        const bad = parse(
            {
                accounts: [{ user: "a", password: "x" }],
                action: { screen: "inside" },
                variable: "n",
            },
            { n: 1 },
        );
        expect(bad.ok).toBe(false);
        const good = parse(
            {
                accounts: [{ user: "a", password: "x" }],
                action: { screen: "inside" },
                variable: "who",
            },
            { who: "" },
        );
        expect(good.ok).toBe(true);
    });
});
