import { describe, expect, it } from "vitest";
import { parseProgram } from "../../engine/schema/program.ts";
import { type ConversationElement, offered } from "./definition.ts";

const parse = (conversation: object) =>
    parseProgram({
        config: { name: "T", variables: { cleared: false } },
        screens: {
            home: { content: [{ type: "conversation", ...conversation }] },
            away: { content: [] },
        },
    });

const talk = {
    start: "hello",
    nodes: {
        hello: {
            say: "HELLO.",
            replies: [
                { text: "WHO ARE YOU?", next: "who", once: true },
                { text: "OPEN THE DOOR", next: "door", if: { cleared: true } },
                { text: "BYE", action: { screen: "away" } },
            ],
        },
        who: { say: ["I AM MOTHER."] },
        door: { say: "I'M AFRAID I CAN'T DO THAT." },
    },
};

describe("a conversation", () => {
    const conversation = () => {
        const result = parse(talk);
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        return result.program.screens.get("home")?.content[0] as unknown as ConversationElement;
    };

    it("offers the replies whose conditions hold, and once-only ones until chosen", () => {
        const texts = (used: string[], cleared: boolean) =>
            offered(conversation(), "hello", used, () => cleared).map(({ reply }) => reply.text);
        expect(texts([], false)).toEqual(["WHO ARE YOU?", "BYE"]);
        expect(texts([], true)).toEqual(["WHO ARE YOU?", "OPEN THE DOOR", "BYE"]);
        expect(texts(["hello#0"], false)).toEqual(["BYE"]);
    });

    it("checks the parts it goes to", () => {
        const result = parse({
            start: "nowhere",
            nodes: { a: { say: "A", replies: [{ text: "X", next: "gone" }] } },
        });
        expect(result.ok ? [] : result.errors.map((error) => error.message)).toEqual([
            'Unknown part "nowhere"',
            'Unknown part "gone"',
        ]);
    });

    it("checks its actions", () => {
        const result = parse({
            start: "a",
            nodes: { a: { say: "A", replies: [{ text: "Y", action: { screen: "missing" } }] } },
        });
        expect(result.ok ? [] : result.errors.map((error) => error.message)).toEqual([
            'Unknown screen "missing"',
        ]);
    });
});
