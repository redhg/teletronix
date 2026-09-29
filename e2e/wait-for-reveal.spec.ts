import { expect, type Program, test } from "./fixtures.ts";

// the reveal has to take time for there to be anything to wait for
test.use({ reducedMotion: "no-preference" });

const LONG = "The rest of the screen is still typing, one character at a time. ".repeat(4);

const program = (waitForReveal: boolean): Program => ({
    config: { name: "Wait", start: "home", waitForReveal },
    screens: {
        home: {
            content: [
                { type: "link", text: "> EARLY LINK", action: { screen: "away" } },
                LONG,
                {
                    type: "prompt",
                    prompt: "> ",
                    commands: [{ command: "go", action: { screen: "away" } }],
                },
            ],
        },
        away: { content: ["AWAY"] },
    },
});

test("controls stay locked while the screen reveals", async ({ page, player }) => {
    await player.open(program(true));
    // revealed, but not yet usable: no button, and nothing to type into
    await expect(player.screen.locator(".link")).toContainText("> EARLY LINK");
    await expect(player.screen.locator("button.link")).toHaveCount(0);
    await expect(player.screen.locator(".prompt input")).toHaveCount(0);

    // once it has all revealed, everything works at once
    await expect(player.link("> EARLY LINK")).toBeVisible({ timeout: 10_000 });
    await expect(player.screen.locator(".prompt input")).toBeFocused();
    await page.keyboard.type("go");
    await page.keyboard.press("Enter");
    await expect(player.screen).toContainText("AWAY");
});

test("a tap finishes the reveal and unlocks them", async ({ player }) => {
    await player.open(program(true));
    await expect(player.screen.locator(".link")).toContainText("> EARLY LINK");
    await player.tap();
    await player.link("> EARLY LINK").click();
    await expect(player.screen).toContainText("AWAY");
});

test("without it, a control works as soon as it's revealed", async ({ player }) => {
    await player.open(program(false));
    await player.link("> EARLY LINK").click();
    await expect(player.screen).toContainText("AWAY");
});
