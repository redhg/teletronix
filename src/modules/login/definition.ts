import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { type Action, ActionSchema, ElementBaseShape } from "../../engine/schema/common.ts";
import { VariableNameSchema } from "../../engine/schema/variables.ts";

export const LOGIN_DEFAULTS = {
    username: "USERNAME: ",
    password: "PASSWORD: ",
    denied: "ACCESS DENIED.",
    remaining: "{n} ATTEMPTS REMAINING.",
    locked: "TOO MANY ATTEMPTS. TERMINAL LOCKED.",
};

export const AccountSchema = z
    .strictObject({
        user: z.string().min(1).optional().meta({
            description: "The username (any case), unless the login asks for a password only",
        }),
        password: z.string().meta({ description: "The password, exactly" }),
        action: ActionSchema.optional().meta({
            description: "What happens when this account logs in (default: the login's action)",
        }),
    })
    .meta({ description: "A username and password that log in" });

export const LoginSchema = z
    .strictObject({
        type: z.literal("login"),
        username: z
            .union([z.string(), z.literal(false)])
            .default(LOGIN_DEFAULTS.username)
            .meta({
                description: `The username prompt, or false to ask for a password only (default: "${LOGIN_DEFAULTS.username}")`,
            }),
        password: z
            .string()
            .default(LOGIN_DEFAULTS.password)
            .meta({
                description: `The password prompt (default: "${LOGIN_DEFAULTS.password}")`,
            }),
        accounts: z.array(AccountSchema).min(1).meta({
            description: "The usernames and passwords that log in",
        }),
        action: ActionSchema.optional().meta({
            description: "What happens on logging in, for accounts without an action of their own",
        }),
        granted: z.string().optional().meta({
            description:
                'Shown on logging in, for a moment before the action, e.g. "ACCESS GRANTED."',
        }),
        after: z.number().min(0).default(1000).meta({
            description: "With granted, milliseconds it shows before the action (default: 1000)",
        }),
        variable: VariableNameSchema.optional().meta({
            description: "A text variable that gets the username, on logging in",
        }),
        attempts: z.int().min(1).optional().meta({
            description:
                "How many wrong tries it takes to lock the terminal, for good (default: no limit)",
        }),
        denied: z
            .string()
            .default(LOGIN_DEFAULTS.denied)
            .meta({
                description: `Shown after a wrong try (default: "${LOGIN_DEFAULTS.denied}")`,
            }),
        remaining: z
            .string()
            .default(LOGIN_DEFAULTS.remaining)
            .meta({
                description:
                    "With attempts, shown after denied: {n} is how many tries are left, or empty " +
                    `for nothing (default: "${LOGIN_DEFAULTS.remaining}")`,
            }),
        locked: z
            .string()
            .default(LOGIN_DEFAULTS.locked)
            .meta({
                description: `Shown once it's locked (default: "${LOGIN_DEFAULTS.locked}")`,
            }),
        onLocked: ActionSchema.optional().meta({
            description: "What happens when it locks (it stays locked, whatever happens)",
        }),
        ...ElementBaseShape,
    })
    .superRefine((login, ctx) => {
        login.accounts.forEach((account, i) => {
            if (login.username !== false && account.user === undefined) {
                ctx.addIssue({
                    code: "custom",
                    path: ["accounts", i, "user"],
                    message: 'Give the account a "user" (or set "username": false)',
                });
            }
            if (account.action === undefined && login.action === undefined) {
                ctx.addIssue({
                    code: "custom",
                    path: ["accounts", i, "action"],
                    message: 'Give the account an "action", or the login one for every account',
                });
            }
        });
    })
    .meta({
        description:
            "A login: a username and a password (shown as *), checked against its accounts. " +
            "Wrong tries are denied, and with attempts, too many lock the terminal.",
    });

export type LoginElement = z.output<typeof LoginSchema> & ElementIdentity;

/** What a login remembers from visit to visit: its wrong tries. */
export interface LoginMemory {
    failures: number;
}

/** Whether it's locked, after this many wrong tries. */
export const isLocked = (login: LoginElement, failures: number) =>
    login.attempts !== undefined && failures >= login.attempts;

/** The action for a username and password, or null if they don't log in. */
export function loginAction(login: LoginElement, user: string, password: string): Action | null {
    const name = user.trim().toLowerCase();
    const account = login.accounts.find(
        (candidate) =>
            candidate.password === password &&
            (login.username === false || candidate.user?.trim().toLowerCase() === name),
    );
    if (!account) return null;
    return account.action ?? login.action ?? null;
}

/** What it says after a wrong try, the `failures`th. */
export function deniedMessage(login: LoginElement, failures: number): string {
    if (isLocked(login, failures)) return login.locked;
    if (login.attempts === undefined || login.remaining === "") return login.denied;
    const left = login.remaining.replaceAll("{n}", String(login.attempts - failures));
    return `${login.denied} ${left}`;
}

export const loginModule: ModuleDefinition<LoginElement, LoginMemory> = {
    // its first prompt; the view draws the rest
    text: (login) => (login.username === false ? login.password : login.username),
    actions: (login) =>
        [
            login.action,
            login.onLocked,
            ...login.accounts.map((account) => account.action),
            // (so the variable is checked: it must be a text variable)
            login.variable === undefined
                ? undefined
                : ActionSchema.parse({ set: { [login.variable]: "" } }),
        ].filter((action): action is Action => action !== undefined),
};
