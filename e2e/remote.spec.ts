import { expect, type Page, type Program, test } from "./fixtures.ts";

const program: Program = {
    config: {
        name: "Remote",
        start: "home",
        reveal: "instant",
        variables: { credits: 0, alarm: false },
        timers: { clock: { from: 90 } },
    },
    screens: {
        home: { title: "HOME", content: ["HOME SCREEN", "CREDITS: {credits}"] },
        bridge: { title: "BRIDGE", parent: "home", content: ["BRIDGE SCREEN"] },
    },
    dialogs: { warning: { type: "alert", content: "WARNING DIALOG" } },
};

/** A GM's panel for the test program, in another window of the same browser. */
async function openGm(page: Page): Promise<Page> {
    const gm = await page.context().newPage();
    await gm.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
    await gm.goto("./?data=e2e&gm");
    return gm;
}

test.describe("a GM's panel", () => {
    test("sees the players' screen, and sends them to another", async ({ page, player }) => {
        await player.open(program);
        const gm = await openGm(page);
        await expect(gm.getByRole("status")).toContainText("Players on HOME");

        await gm.getByRole("button", { name: /BRIDGE/ }).click();
        await expect(player.screen).toContainText("BRIDGE SCREEN");
        await expect(gm.getByRole("status")).toContainText("Players on BRIDGE");
        await gm.getByRole("button", { name: "← Back" }).click();
        await expect(player.screen).toContainText("HOME SCREEN");
    });

    test("says when no players' window is open", async ({ page }) => {
        await page.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        await page.goto("./?data=e2e&gm");
        await expect(page.getByRole("status")).toContainText("No players' window is open");
    });

    test("changes variables, and sees them change", async ({ page, player }) => {
        await player.open(program);
        const gm = await openGm(page);
        const credits = gm.getByRole("spinbutton", { name: "credits" });
        await credits.fill("250");
        await credits.press("Enter");
        await gm.getByRole("checkbox", { name: "alarm" }).click();
        await expect(gm.getByRole("checkbox", { name: "alarm" })).toBeChecked();
        await expect(player.screen).toContainText("CREDITS: 250");
    });

    test("opens and closes dialogs, and transmits messages", async ({ page, player }) => {
        await player.open(program);
        const gm = await openGm(page);
        await gm.getByRole("button", { name: "warning" }).click();
        await expect(player.dialog).toContainText("WARNING DIALOG");
        await gm.getByRole("button", { name: "Close the open dialog" }).click();
        await expect(player.dialog).toHaveCount(0);

        await gm.getByRole("textbox", { name: "Message" }).fill("MOTHER: CREW EXPENDABLE.");
        await gm.getByRole("textbox", { name: "Button" }).fill("ACKNOWLEDGE");
        await gm.getByRole("checkbox", { name: "Alert colour" }).check();
        await gm.getByRole("button", { name: "Send" }).click();
        await expect(player.dialog).toContainText("MOTHER: CREW EXPENDABLE.");
        await expect(player.dialog).toContainText("ACKNOWLEDGE");
        await expect(gm.getByRole("status")).toContainText("@transmission");
    });

    test("runs timers and turns effects on", async ({ page, player }) => {
        await player.open(program);
        const gm = await openGm(page);
        await gm.getByRole("button", { name: "Start", exact: true }).click();
        await expect(gm.locator(".gm-timer")).toContainText("▶");
        await gm.getByRole("button", { name: "Stop", exact: true }).click();
        await expect(gm.locator(".gm-timer")).toContainText("■");

        await gm.getByRole("combobox", { name: "static" }).selectOption("on");
        await expect(page.locator("canvas.static")).toBeAttached();
        await gm.getByRole("combobox", { name: "static" }).selectOption("program");
        await expect(page.locator("canvas.static")).toHaveCount(0);
    });
});
