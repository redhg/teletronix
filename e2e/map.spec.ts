import { expect, type Page, type Program, test } from "./fixtures.ts";

// The editor's Map: a program's screens as cards, and the ways between them as arrows.

const program: Program = {
    config: { name: "Map", start: "home", variables: { keycard: false } },
    screens: {
        home: {
            title: "HOME",
            content: [
                "WELCOME ABOARD.",
                { type: "link", text: "> BRIDGE", action: { screen: "bridge" } },
                {
                    type: "link",
                    text: "> VAULT",
                    action: { if: { keycard: true }, screen: "vault" },
                },
            ],
        },
        bridge: {
            title: "BRIDGE",
            content: [
                "THE BRIDGE.",
                { type: "link", text: "> WARN", action: { dialog: "warning" } },
            ],
        },
        vault: {
            title: "VAULT",
            next: { after: 2000, action: { screen: "home" } },
            content: ["GOLD."],
        },
    },
    dialogs: { warning: { type: "alert", content: "SOMETHING'S WRONG." } },
};

async function openMap(page: Page) {
    await page.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
    await page.goto("./?edit&data=e2e");
    await page
        .getByRole("navigation", { name: "Parts of the program" })
        .getByRole("button", { name: /^Map/ })
        .click();
    const map = page.getByRole("region", { name: "Map of the program" });
    await expect(map.locator(".react-flow__node")).toHaveCount(4);
    return map;
}

const card = (map: ReturnType<Page["getByRole"]>, title: string) =>
    map.locator(".react-flow__node").filter({ has: map.page().getByText(title, { exact: true }) });

test.describe("the editor's map", () => {
    test("shows every screen and dialog, and every way between them, labelled", async ({
        page,
    }) => {
        const map = await openMap(page);
        await expect(card(map, "HOME")).toContainText("start");
        await expect(card(map, "HOME")).toContainText("WELCOME ABOARD.");
        await expect(card(map, "warning")).toContainText("dialog");
        await expect(map.locator(".react-flow__edge")).toHaveCount(4);
        // (SVG text: its textContent, as it has no innerText)
        const labels = await map.locator(".react-flow__edge-text").allTextContents();
        expect(labels.sort()).toEqual(["> BRIDGE", "> VAULT if keycard", "> WARN", "after 2 s"]);
    });

    test("finds a screen, and opens one to edit with a double-click", async ({ page }) => {
        const map = await openMap(page);
        await map.getByRole("textbox", { name: "Find a screen" }).fill("vau");
        await map.getByRole("button", { name: "Find" }).click();
        await expect(card(map, "VAULT")).toHaveClass(/selected/);

        await card(map, "BRIDGE").dblclick();
        await expect(
            page
                .getByRole("navigation", { name: "Parts of the program" })
                .locator('[aria-current="true"]'),
        ).toContainText("BRIDGE");
    });

    test("keeps a card where it's put, until it's arranged again", async ({ page }) => {
        const map = await openMap(page);
        const vault = card(map, "VAULT");
        const before = await vault.boundingBox();
        if (!before) throw new Error("no card");
        await page.mouse.move(before.x + 40, before.y + 10);
        await page.mouse.down();
        await page.mouse.move(before.x + 140, before.y + 70, { steps: 5 });
        await page.mouse.up();
        // (where it is: its translate, as the rest of its style changes as it's measured)
        const place = async (locator: typeof vault) =>
            /translate\([^)]*\)/.exec((await locator.getAttribute("style")) ?? "")?.[0];
        const moved = await place(vault);
        expect(moved).toBeDefined();

        await page.reload();
        const again = await openMap(page);
        await expect.poll(() => place(card(again, "VAULT"))).toBe(moved);
        await again.getByRole("button", { name: "Arrange again" }).click();
        await expect.poll(() => place(card(again, "VAULT"))).not.toBe(moved);
    });
});
