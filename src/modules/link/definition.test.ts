import { describe, expect, it } from "vitest";
import { type LinkElement, linkAction } from "./definition.ts";

const link = (secondary?: boolean): LinkElement => ({
    id: "x",
    type: "link",
    text: "> GO",
    action: [{ screen: "main" }],
    ...(secondary ? { secondaryAction: [{ dialog: "locked" }] } : {}),
});

describe("linkAction", () => {
    it("picks the secondary action for a secondary press", () => {
        expect(linkAction(link(true), false)).toEqual([{ screen: "main" }]);
        expect(linkAction(link(true), true)).toEqual([{ dialog: "locked" }]);
    });

    it("falls back to the main action when there's no secondary one", () => {
        expect(linkAction(link(), true)).toEqual([{ screen: "main" }]);
    });
});
