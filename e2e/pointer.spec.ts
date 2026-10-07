import { expect, type Page, type Program, test } from "./fixtures.ts";

const program = (pointer: unknown, screens: Program["screens"] = {}): Program => ({
    config: { name: "Pointer", start: "home", reveal: "instant", pointer } as Program["config"],
    screens: {
        home: {
            content: [
                "HOME",
                "A SECOND LINE OF TEXT",
                { type: "link", text: "> TARGETING", action: { screen: "targeting" } },
            ],
        },
        targeting: { pointer: "crosshair", content: ["TARGETING"] },
        ...screens,
    },
});

const cursor = (page: Page, selector = "body") =>
    page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).cursor);

test.describe("the mouse pointer", () => {
    test("is the browser's own, unless the program says otherwise", async ({ page, player }) => {
        await player.open(program(undefined));
        expect(await cursor(page)).toBe("auto");
        await expect(page.locator(".pointer-block, .pointer-across")).toHaveCount(0);
    });

    test("can be a pixel arrow in the theme's colors, and a hand on links", async ({
        page,
        player,
    }) => {
        await player.open(program("theme"));
        expect(await cursor(page)).toMatch(/^url\("data:image\/png/);
        const link = await cursor(page, ".screen button, .screen a");
        expect(link).toMatch(/^url\("data:image\/png/);
        expect(link).not.toBe(await cursor(page));
    });

    test("can be an image, or hidden", async ({ page, player }) => {
        await player.open(program({ src: "data/pointers/claw.png", x: 3, y: 2 }));
        expect(await cursor(page)).toContain("claw.png");
        await player.open(program("hidden"));
        expect(await cursor(page)).toBe("none");
    });

    test("can be a block that jumps from character cell to cell", async ({ page, player }) => {
        await player.open(program("block"));
        const block = page.locator(".pointer-block");
        expect(await cursor(page)).toBe("none");
        await expect(block).toBeHidden();
        const text = await player.screen.getByText("HOME").first().boundingBox();
        if (!text) throw new Error("no text");
        const at = async (x: number, y: number) => {
            await page.mouse.move(x, y);
            await expect(block).toBeVisible();
            return block.boundingBox();
        };
        // anywhere in a cell, the same cell
        const first = await at(text.x + 2, text.y + 2);
        const same = await at(text.x + 5, text.y + 6);
        expect(same).toEqual(first);
        if (!first) throw new Error("no block");
        // a cell's width on, and a line down
        const next = await at(text.x + first.width + 2, text.y + first.height + 2);
        expect(next?.x).toBeCloseTo(first.x + first.width, 0);
        expect(next?.y).toBeCloseTo(first.y + first.height, 0);
    });

    test("can be a screen's own, e.g. a crosshair", async ({ page, player }) => {
        await player.open(program("system"));
        await player.link("> TARGETING").click();
        await page.mouse.move(200, 150);
        await expect(page.locator(".pointer-across")).toBeVisible();
        await expect(page.locator(".pointer-down")).toBeVisible();
    });

    test("goes back to the device's own from quick settings", async ({ page, player }) => {
        await player.open(program("hidden"));
        await page.keyboard.press("Control+,");
        await page.locator('[data-row="pointer"]').click();
        await expect(page.locator('[data-row="pointer"]')).toContainText("THIS DEVICE'S");
        await page.keyboard.press("Escape");
        expect(await cursor(page)).toBe("auto");
    });
});
