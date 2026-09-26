import { describe, expect, it } from "vitest";
import { type LinkElement, linkAction } from "./definition.ts";

const link = (secondary?: boolean): LinkElement => ({
    id: "x",
    type: "link",
    text: "> GO",
    action: { type: "screen", target: "main" },
    ...(secondary ? { secondaryAction: { type: "dialog", target: "locked" } } : {}),
});

describe("linkAction", () => {
    it("picks the secondary action for a secondary press", () => {
        expect(linkAction(link(true), false)).toEqual({ type: "screen", target: "main" });
        expect(linkAction(link(true), true)).toEqual({ type: "dialog", target: "locked" });
    });

    it("falls back to the main action when there's no secondary one", () => {
        expect(linkAction(link(), true)).toEqual({ type: "screen", target: "main" });
    });
});
