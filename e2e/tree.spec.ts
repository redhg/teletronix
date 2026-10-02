import { expect, type Program, test } from "./fixtures.ts";

const program: Program = {
    config: { name: "Tree", start: "home" },
    screens: {
        home: {
            content: [
                {
                    type: "frames",
                    frames: [
                        {
                            content: [
                                {
                                    type: "tree",
                                    frame: "record",
                                    items: [
                                        {
                                            text: "CREW",
                                            open: true,
                                            items: [
                                                { text: "DALLAS", screen: "dallas" },
                                                { text: "ASH", screen: "ash" },
                                            ],
                                        },
                                        {
                                            text: "ORDERS",
                                            items: [{ text: "ORDER 937", screen: "order" }],
                                        },
                                    ],
                                },
                            ],
                        },
                        { name: "record", title: "RECORD", screen: "dallas" },
                    ],
                },
            ],
        },
        dallas: { content: ["DALLAS FILE"] },
        ash: {
            content: [
                "ASH FILE",
                {
                    type: "link",
                    text: "> ORDER 937",
                    action: { frame: "record", screen: "order" },
                },
            ],
        },
        order: { content: ["CREW EXPENDABLE"] },
    },
};

test.describe("tree", () => {
    test("draws its folders and items, marking the one showing in its frame", async ({
        player,
    }) => {
        await player.open(program);
        const items = player.screen.getByRole("treeitem");
        await expect(items).toHaveText(["[-] CREW", " ├─ DALLAS ◄", " └─ ASH", "[+] ORDERS"]);
        await expect(player.screen.getByRole("treeitem", { name: /DALLAS/ })).toHaveAttribute(
            "aria-current",
            "page",
        );
    });

    test("moves with the arrow keys, opening folders and items", async ({ page, player }) => {
        await player.open(program);
        const record = player.screen.getByRole("region", { name: "RECORD" });
        // it takes the keyboard, at the item showing
        await expect(player.screen.getByRole("treeitem", { name: /DALLAS/ })).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(record).toContainText("ASH FILE");

        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowRight");
        await expect(player.screen.getByRole("treeitem", { name: /ORDERS/ })).toHaveAttribute(
            "aria-expanded",
            "true",
        );
        await page.keyboard.press("ArrowRight");
        await expect(player.screen.getByRole("treeitem", { name: /ORDER 937/ })).toBeFocused();
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("ArrowLeft");
        await expect(player.screen.getByRole("treeitem")).toHaveCount(4);
    });

    test("opens folders and items with a click", async ({ player }) => {
        await player.open(program);
        await player.screen.getByRole("treeitem", { name: /ORDERS/ }).click();
        await player.screen.getByRole("treeitem", { name: /ORDER 937/ }).click();
        await expect(player.screen.getByRole("region", { name: "RECORD" })).toContainText(
            "CREW EXPENDABLE",
        );
        // a click on it isn't a click on the screen
        await expect(player.screen.getByRole("treeitem", { name: /ORDER 937/ })).toContainText("◄");
    });

    test("follows its frame, opening the folder of what shows there", async ({ player }) => {
        await player.open(program);
        await player.screen.getByRole("treeitem", { name: /ASH/ }).click();
        await player.link("> ORDER 937").click();
        await expect(player.screen.getByRole("treeitem", { name: /ORDER 937/ })).toContainText("◄");
        await expect(player.screen.getByRole("treeitem", { name: /ORDERS/ })).toHaveAttribute(
            "aria-expanded",
            "true",
        );
    });
});
