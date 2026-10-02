import { describe, expect, it } from "vitest";
import { ActionSchema } from "../../engine/schema/common.ts";
import { parseProgram } from "../../engine/schema/program.ts";
import {
    ancestors,
    itemAction,
    openFolders,
    rowText,
    type TreeElement,
    treeModule,
    treeRows,
} from "./definition.ts";

const parse = (tree: object, screens: object = {}) =>
    parseProgram({
        config: { name: "T" },
        screens: { home: { content: [{ type: "tree", ...tree }] }, a: { content: [] }, ...screens },
    });

const tree = (input: object): TreeElement => {
    const result = parse(input);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.program.screens.get("home")?.content[0] as TreeElement;
};

const ITEMS = {
    items: [
        {
            text: "CREW",
            open: true,
            items: [
                { text: "DALLAS", screen: "a" },
                { text: "RECORDS", items: [{ text: "OLD", screen: "a" }] },
                { text: "RIPLEY", screen: "a" },
            ],
        },
        { text: "ORDERS", items: [{ text: "937", screen: "a" }] },
        { text: "HELP", screen: "a" },
    ],
};

const drawn = (element: TreeElement, open: string[] | undefined) =>
    treeRows(element, openFolders(element, open && { open })).map((row) => rowText(element, row));

describe("tree", () => {
    it("draws its open folders' items with box lines, as written to begin with", () => {
        expect(drawn(tree(ITEMS), undefined)).toEqual([
            "[-] CREW",
            " ├─ DALLAS",
            " ├─ [+] RECORDS",
            " └─ RIPLEY",
            "[+] ORDERS",
            "    HELP",
        ]);
    });

    it("draws deeper folders under their own, with lines for the folders still going", () => {
        expect(drawn(tree(ITEMS), ["0", "0.1", "1"])).toEqual([
            "[-] CREW",
            " ├─ DALLAS",
            " ├─ [-] RECORDS",
            " │   └─ OLD",
            " └─ RIPLEY",
            "[-] ORDERS",
            " └─ 937",
            "    HELP",
        ]);
        expect(treeModule.text(tree(ITEMS), { open: [] }, (text) => text)).toBe(
            "[+] CREW\n[+] ORDERS\n    HELP",
        );
    });

    it("opens items' screens, in its frame if it has one", () => {
        const plain = tree(ITEMS);
        const item = plain.items[2];
        if (!item) throw new Error("no item");
        expect(itemAction(plain, item)).toEqual(ActionSchema.parse({ screen: "a" }));
        const result = parseProgram({
            config: { name: "T" },
            screens: {
                home: {
                    content: [
                        { type: "frames", frames: [{ name: "detail", content: [] }] },
                        { type: "tree", frame: "detail", items: [{ text: "X", screen: "home" }] },
                    ],
                },
            },
        });
        if (!result.ok) throw new Error(JSON.stringify(result.errors));
        const framed = result.program.screens.get("home")?.content[1] as TreeElement;
        expect(itemAction(framed, framed.items[0] as never)).toEqual(
            ActionSchema.parse({ frame: "detail", screen: "home" }),
        );
    });

    it("knows the folders an item is in", () => {
        expect(ancestors("0.1.2")).toEqual(["0", "0.1"]);
        expect(ancestors("3")).toEqual([]);
    });

    it("checks its items and their screens", () => {
        const result = parse({
            frame: "nowhere",
            items: [{ text: "EMPTY" }, { text: "F", items: [{ text: "G", screen: "gone" }] }],
        });
        expect(result.ok ? [] : result.errors.map((error) => error.message)).toEqual([
            'An item needs "items" (a folder), a "screen" or an "action"',
        ]);
        const later = parse({ frame: "nowhere", items: [{ text: "G", screen: "gone" }] });
        expect(later.ok ? [] : later.errors.map((error) => error.message)).toEqual([
            'No frame is named "nowhere"',
            'Unknown screen "gone"',
        ]);
    });
});
