import { expect, type Page, type Program, test } from "./fixtures.ts";

const program: Program = {
    config: { name: "Settings", start: "home", effects: { flicker: true } },
    screens: {
        home: {
            content: [
                "HOME, WITH A LINE LONG ENOUGH TO TAKE A WHILE TO TYPE IN AT THE USUAL SPEED.",
                { type: "link", text: "> NEXT", action: { screen: "next" } },
            ],
            next: [{ key: "n", action: { screen: "next" } }],
        },
        next: { content: ["NEXT SCREEN"] },
    },
};

const dialog = (page: Page) => page.getByRole("dialog", { name: /SETTINGS/ });
/** A row of the dialog, by its id (sound, volume, look, text-size, effects, instant). */
const row = (page: Page, id: string) => dialog(page).locator(`[data-row="${id}"]`);
const background = (page: Page) =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("quick settings", () => {
    // (as most devices are: the other tests ask for reduced motion, for speed)
    test.use({ reducedMotion: "no-preference" });

    test("opens with Ctrl+, and changes things for this player, kept on the device", async ({
        page,
        player,
    }) => {
        await player.open(program);
        await expect(page.locator(".effects .flicker")).toHaveCount(1);
        await page.keyboard.press("Control+,");
        await expect(dialog(page)).toBeVisible();
        // the screen's keys stay out of it
        await page.keyboard.press("n");
        await expect(player.screen).not.toContainText("NEXT SCREEN");

        const look = dialog(page).getByRole("button", { name: "look" });
        await look.focus();
        await page.keyboard.press("ArrowRight");
        await expect(look).toContainText("HIGH CONTRAST, DARK");
        expect(await background(page)).toBe("rgb(0, 0, 0)");
        await expect(page.locator(".effects .flicker")).toHaveCount(0);

        const size = dialog(page).getByRole("slider", { name: "text size" });
        await size.focus();
        await page.keyboard.press("ArrowRight");
        await expect(size).toHaveAttribute("aria-valuenow", "125");

        await page.keyboard.press("Escape");
        await expect(dialog(page)).toHaveCount(0);

        // still so after a reload
        await page.reload();
        await player.screen.waitFor();
        expect(await background(page)).toBe("rgb(0, 0, 0)");

        // and back to the program's look
        await page.keyboard.press("Control+,");
        await dialog(page).getByRole("button", { name: "RESET" }).click();
        await expect(look).toContainText("AS MADE");
        expect(await background(page)).not.toBe("rgb(0, 0, 0)");
    });

    test("can turn effects off, and show text at once", async ({ page, player }) => {
        await player.open(program);
        await expect(page.locator(".effects .flicker")).toHaveCount(1);
        await page.keyboard.press("Control+,");
        await row(page, "effects").click();
        await expect(page.locator(".effects .flicker")).toHaveCount(0);
        await row(page, "instant").click();
        await expect(row(page, "instant")).toContainText("ALL AT ONCE");
        await page.keyboard.press("Escape");
        await player.link("> NEXT").click();
        // all of it, at once
        await expect(player.screen).toContainText("NEXT SCREEN");
    });

    test("opens from a right-click on the sound toggle", async ({ page, player }) => {
        await player.open(program);
        await page.getByRole("button", { name: "Sound" }).click({ button: "right" });
        await expect(dialog(page)).toBeVisible();
    });

    test("isn't there when the program says so", async ({ page, player }) => {
        await player.open({ ...program, config: { ...program.config, playerSettings: false } });
        await page.keyboard.press("Control+,");
        await page.waitForTimeout(300);
        await expect(dialog(page)).toHaveCount(0);
    });

    test.describe("on a device that asks for less motion", () => {
        test.use({ reducedMotion: "reduce" });

        test("starts with text at once, effects as made", async ({ page, player }) => {
            await player.open(program);
            await page.keyboard.press("Control+,");
            await expect(row(page, "instant")).toContainText("ALL AT ONCE");
            await expect(row(page, "effects")).toContainText("ON");
        });
    });
});
