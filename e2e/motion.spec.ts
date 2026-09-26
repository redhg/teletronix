import { expect, type Program, test } from "./fixtures.ts";

// reveals and transitions, which the other tests turn off
test.use({ reducedMotion: "no-preference" });

const LONG = "The quick brown fox jumps over the lazy dog. ".repeat(8).trim();

const link = (text: string, screen: string) => ({
    type: "link" as const,
    text,
    action: { screen },
});

const program: Program = {
    config: { name: "Motion", start: "home" },
    screens: {
        home: {
            content: [
                "HOME",
                link("> TYPE", "type"),
                link("> GLITCH", "glitch"),
                link("> FADE", "fade"),
                link("> STATIC", "static"),
                link("> LATER", "later"),
            ],
        },
        type: { content: [LONG, link("> BACK", "home")] },
        glitch: {
            reveal: "glitch",
            transition: "glitch",
            content: ["GLITCHED IN", link("> BACK", "home")],
        },
        fade: {
            reveal: "instant",
            transition: { type: "fade", duration: 1000 },
            content: ["FADED IN", link("> BACK", "home")],
        },
        static: {
            reveal: "instant",
            transition: { type: "static", duration: 400 },
            content: ["AFTER THE STATIC", link("> BACK", "home")],
        },
        later: {
            reveal: "instant",
            next: { after: 300, action: { screen: "home" } },
            content: ["WAIT FOR IT"],
        },
    },
};

test.beforeEach(async ({ player }) => {
    await player.open(program);
    await player.tap();
    await expect(player.link("> LATER")).toBeVisible();
});

test("teletype types the text out, and a tap finishes it", async ({ player }) => {
    await player.link("> TYPE").click();
    await expect.poll(() => player.text()).toContain("The quick");
    const partway = await player.text();
    expect(partway.length).toBeLessThan(LONG.length);
    await expect(player.screen.locator(".reveal-cursor")).not.toBeEmpty();

    await player.tap();
    await expect(player.link("> BACK")).toBeVisible();
    expect((await player.text()).replace(/\s+/g, " ")).toContain(LONG);
});

test("glitch resolves the text out of noise", async ({ player }) => {
    await player.link("> GLITCH").click();
    await expect.poll(() => player.text()).not.toContain("GLITCHED IN");
    await expect(player.link("> BACK")).toBeVisible({ timeout: 5000 });
    await expect.poll(() => player.text()).toContain("GLITCHED IN");
});

test("a glitch transition erases the old screen over the new one", async ({ page, player }) => {
    await player.link("> GLITCH").click();
    await expect(player.outgoing).toHaveCount(1);
    await expect(player.outgoing).toHaveAttribute("inert");
    await expect(player.outgoing).toContainText("HOME");
    // after the current screen, so it paints on top of it
    const order = await page.$$eval(".screens > .screen", (screens) =>
        screens.map((screen) => screen.classList.contains("outgoing")),
    );
    expect(order).toEqual([false, true]);
    await expect(player.outgoing).toHaveCount(0, { timeout: 5000 });
});

test("a fade transition fades the old screen behind the new one", async ({ page, player }) => {
    await player.link("> FADE").click();
    await expect(player.screen).toContainText("FADED IN");
    await expect(page.locator(".screen.fading")).toHaveCount(1);
    // before the current screen, so the new text is on top of the afterglow
    const order = await page.$$eval(".screens > .screen", (screens) =>
        screens.map((screen) => screen.classList.contains("fading")),
    );
    expect(order).toEqual([true, false]);
    await expect(page.locator(".screen.fading")).toHaveCount(0, { timeout: 5000 });
});

test("a static transition shows noise before the new screen", async ({ page, player }) => {
    await player.link("> STATIC").click();
    await expect(page.locator(".interstitial canvas")).toHaveCount(1);
    await expect(player.screen).not.toContainText("AFTER THE STATIC");
    await expect(page.locator(".interstitial")).toHaveCount(0);
    await expect(player.screen).toContainText("AFTER THE STATIC");
});

test('"next" can move on after a time', async ({ player }) => {
    await player.link("> LATER").click();
    await expect(player.screen).toContainText("WAIT FOR IT");
    await expect(player.screen).toContainText("HOME");
});

test("reduced motion shows everything at once", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
    await page.goto("./?data=e2e");
    await page.locator("button.link", { hasText: "> TYPE" }).click();
    // no transition, and the text is all there at once
    await expect(page.locator(".screen")).toHaveCount(1);
    await expect(page.locator(".screen button.link", { hasText: "> BACK" })).toBeVisible();
    await context.close();
});
