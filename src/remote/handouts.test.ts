import { describe, expect, it } from "vitest";
import { parseProgram } from "../engine/index.ts";
import { handoutsOf } from "./handouts.ts";

describe("handouts", () => {
    it("finds every view and every image a program shows, once each", () => {
        const result = parseProgram({
            config: { name: "T" },
            screens: {
                home: {
                    content: [
                        {
                            type: "link",
                            text: "> TAPE",
                            action: { view: { src: "tape.mp4", osd: true } },
                        },
                        { type: "link", text: "> AGAIN", action: { view: "tape.mp4" } },
                        { type: "bitmap", src: "map.png", alt: "A MAP" },
                    ],
                },
            },
            dialogs: {
                warn: {
                    type: "confirm",
                    content: "LOOK?",
                    confirm: { text: "YES", action: { view: "photo.jpg" } },
                },
            },
        });
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        expect(handoutsOf(result.program).map(({ src, kind }) => [src, kind])).toEqual([
            ["tape.mp4", "video"],
            ["map.png", "image"],
            ["photo.jpg", "image"],
        ]);
        expect(handoutsOf(result.program)[0]?.view?.osd).toBe(true);
    });
});
