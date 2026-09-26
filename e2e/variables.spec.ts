import { expect, type Program, test } from "./fixtures.ts";

const program: Program = {
    config: {
        name: "Vault",
        start: "name",
        variables: { name: "", keycard: false, power: 50, lights: false },
    },
    screens: {
        name: {
            content: [
                "WHO GOES THERE?",
                { type: "prompt", prompt: "NAME: ", variable: "name", onEnter: { screen: "hall" } },
            ],
        },
        hall: {
            content: [
                "WELCOME, {name}.",
                { type: "text", text: "A KEYCARD LIES ON THE FLOOR.", if: { keycard: false } },
                {
                    type: "link",
                    text: "> TAKE THE KEYCARD",
                    if: { keycard: false },
                    action: { set: { keycard: true }, screen: "hall" },
                },
                {
                    type: "link",
                    text: "> OPEN THE VAULT",
                    action: [{ if: { keycard: true }, screen: "vault" }, { dialog: "locked" }],
                },
                { type: "toggle", states: ["[ ] LIGHTS", "[X] LIGHTS"], variable: "lights" },
                { type: "slider", label: "POWER ", variable: "power", step: 10, unit: "%" },
                "POWER IS AT {power}%.",
                { type: "link", text: "> LOOK AROUND", action: { screen: "look" } },
            ],
        },
        look: {
            content: [
                { type: "text", text: "IT IS DARK.", if: { lights: false } },
                { type: "text", text: "THE LIGHTS ARE ON.", if: { lights: true } },
                {
                    type: "text",
                    text: "THE GENERATOR ROARS.",
                    if: { power: { atLeast: 80 } },
                },
                { type: "link", text: "> BACK", action: { screen: "hall" } },
            ],
        },
        vault: { content: ["THE VAULT OPENS, {name}."] },
    },
    dialogs: { locked: { type: "alert", content: "THE VAULT IS LOCKED, {name}." } },
};

test.beforeEach(async ({ page, player }) => {
    await player.open(program);
    await page.keyboard.type("Ada");
    await page.keyboard.press("Enter");
    await expect(player.screen).toContainText("WELCOME, Ada.");
});

test("an action's first case that holds happens", async ({ page, player }) => {
    await player.link("> OPEN THE VAULT").click();
    await expect(player.dialog).toContainText("THE VAULT IS LOCKED, Ada.");
    await page.keyboard.press("Enter");

    await player.link("> TAKE THE KEYCARD").click();
    await expect(player.screen).not.toContainText("A KEYCARD LIES ON THE FLOOR.");
    await expect(player.link("> TAKE THE KEYCARD")).toHaveCount(0);
    await player.link("> OPEN THE VAULT").click();
    await expect(player.screen).toContainText("THE VAULT OPENS, Ada.");
});

test("a toggle and a slider keep their variables", async ({ page, player }) => {
    await player.screen.locator(".toggle").click();
    const slider = player.screen.getByRole("slider", { name: "POWER" });
    await slider.focus();
    await page.keyboard.press("End");
    // the text follows the variable at once
    await expect(player.screen).toContainText("POWER IS AT 100%.");

    await player.link("> LOOK AROUND").click();
    await expect(player.screen).toContainText("THE LIGHTS ARE ON.");
    await expect(player.screen).toContainText("THE GENERATOR ROARS.");
    await expect(player.screen).not.toContainText("IT IS DARK.");

    await player.link("> BACK").click();
    await expect(player.screen.locator(".toggle")).toContainText("[X] LIGHTS");
    await expect(slider).toHaveAttribute("aria-valuenow", "100");
});

test("variables reset when the page reloads", async ({ page, player }) => {
    await player.link("> TAKE THE KEYCARD").click();
    await page.reload();
    await expect(player.screen).toContainText("WHO GOES THERE?");
    await page.keyboard.type("Bob");
    await page.keyboard.press("Enter");
    await expect(player.screen).toContainText("WELCOME, Bob.");
    await expect(player.screen).toContainText("A KEYCARD LIES ON THE FLOOR.");
});
