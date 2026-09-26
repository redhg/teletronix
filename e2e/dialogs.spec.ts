import { expect, type Program, test } from "./fixtures.ts";

const program: Program = {
    config: { name: "Dialogs", start: "home" },
    screens: {
        home: {
            content: [
                "HOME",
                { type: "link", text: "> ALERT", action: { dialog: "alert" } },
                { type: "link", text: "> CONFIRM", action: { dialog: "confirm" } },
            ],
        },
        confirmed: { content: ["CONFIRMED"] },
    },
    dialogs: {
        alert: { type: "alert", content: ["AN ALERT", "ON TWO LINES"], dismiss: "UNDERSTOOD" },
        confirm: {
            type: "confirm",
            content: "ARE YOU SURE?",
            confirm: { text: "YES", action: { screen: "confirmed" } },
            cancel: { text: "NO", action: { dialog: "cancelled" } },
        },
        cancelled: { type: "alert", content: "CANCELLED" },
    },
};

test.beforeEach(async ({ player }) => {
    await player.open(program);
});

test.describe("an alert", () => {
    test.beforeEach(async ({ player }) => {
        await player.link("> ALERT").click();
        await expect(player.dialog).toContainText("AN ALERT\nON TWO LINES");
    });

    test("focuses its button", async ({ player }) => {
        await expect(player.dialog.getByRole("button", { name: "UNDERSTOOD" })).toBeFocused();
    });

    test("closes with Enter", async ({ page, player }) => {
        await page.keyboard.press("Enter");
        await expect(player.dialog).toHaveCount(0);
    });

    test("closes with Escape", async ({ page, player }) => {
        await page.keyboard.press("Escape");
        await expect(player.dialog).toHaveCount(0);
    });

    test("closes with a click on its text", async ({ player }) => {
        await player.dialog.locator(".dialog-content").click();
        await expect(player.dialog).toHaveCount(0);
    });

    test("closes with a click outside it", async ({ page, player }) => {
        await page.mouse.click(5, 5);
        await expect(player.dialog).toHaveCount(0);
    });

    test("closes with a click on a link behind it, without following it", async ({
        page,
        player,
    }) => {
        const box = await player.link("> CONFIRM").boundingBox();
        if (!box) throw new Error("no link");
        await page.mouse.click(box.x + 10, box.y + box.height / 2);
        await expect(player.dialog).toHaveCount(0);
        await page.waitForTimeout(100);
        await expect(player.dialog).toHaveCount(0);
    });
});

test.describe("a confirm", () => {
    test.beforeEach(async ({ player }) => {
        await player.link("> CONFIRM").click();
        await expect(player.dialog).toContainText("ARE YOU SURE?");
    });

    test("confirms with Enter", async ({ page, player }) => {
        await page.keyboard.press("Enter");
        await expect(player.dialog).toHaveCount(0);
        await expect(player.screen).toContainText("CONFIRMED");
    });

    test("cancels with Escape, and can open another dialog", async ({ page, player }) => {
        await page.keyboard.press("Escape");
        await expect(player.dialog).toContainText("CANCELLED");
    });

    test("cancels with its button", async ({ player }) => {
        await player.dialog.getByRole("button", { name: "NO" }).click();
        await expect(player.dialog).toContainText("CANCELLED");
    });

    test("stays open for a click on its text", async ({ player }) => {
        await player.dialog.locator(".dialog-content").click();
        await expect(player.dialog).toContainText("ARE YOU SURE?");
    });

    test("cancels with a click outside it", async ({ page, player }) => {
        await page.mouse.click(5, 5);
        await expect(player.dialog).toContainText("CANCELLED");
    });
});
