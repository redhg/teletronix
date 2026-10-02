import { describe, expect, it } from "vitest";
import { getIn, parsePath, setIn } from "./paths.ts";

describe("paths", () => {
    const file = { config: { name: "T", header: [{ left: "A" }] }, screens: {} };

    it("read a value deep inside", () => {
        expect(getIn(file, ["config", "header", 0, "left"])).toBe("A");
        expect(getIn(file, ["config", "nope", 3])).toBeUndefined();
    });

    it("change one, leaving the rest as it was", () => {
        const next = setIn(file, ["config", "header", 0, "left"], "B") as typeof file;
        expect(next.config.header[0]?.left).toBe("B");
        expect(file.config.header[0]?.left).toBe("A");
        expect(next.screens).toBe(file.screens);
        expect(setIn(file, ["config", "author"], "Me")).toMatchObject({
            config: { name: "T", author: "Me" },
        });
    });

    it("remove a key set to undefined", () => {
        expect(setIn(file, ["config", "name"], undefined)).toEqual({
            config: { header: [{ left: "A" }] },
            screens: {},
        });
    });

    it("read a parse error's path", () => {
        expect(parsePath("config.header[0].left")).toEqual(["config", "header", 0, "left"]);
        expect(parsePath("screens.home.content[12]")).toEqual(["screens", "home", "content", 12]);
    });
});
