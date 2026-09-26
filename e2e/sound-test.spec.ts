import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

test.use({ viewport: { width: 1250, height: 1000 } });

const voice = (page: Page, label: string) =>
    page.locator("fieldset.voice").filter({ has: page.locator(`legend:text-is("${label}")`) });
const selectedTab = (page: Page) => page.locator('[role="tab"][aria-selected="true"]');

test.describe("the built-in tab", () => {
    const output = (page: Page) => page.locator("#panel-builtin .output");

    test.beforeEach(async ({ page, audio: _ }) => {
        await page.goto("./?sound");
        await expect(selectedTab(page)).toHaveText("Built-in");
    });

    for (const label of [
        "Glitch",
        "Static burst",
        "Select",
        "Slider tick",
        "Dialog",
        "Alert",
        "Error",
    ]) {
        test(`plays the ${label.toLowerCase()} sound`, async ({ page, audio }) => {
            const played = await audio.during(() =>
                voice(page, label).getByRole("button", { name: "Play" }).click(),
            );
            expect(played.oscillators + played.noise).toBeGreaterThan(0);
        });
    }

    test("clicks for keys typed", async ({ page, audio }) => {
        // start audio, and let a click's minimum gap pass
        await page.locator(".type-here").click();
        await page.keyboard.press("Shift");
        await expect.poll(async () => (await audio.counts()).time).toBeGreaterThan(0.1);
        const played = await audio.during(() => page.keyboard.type("abc", { delay: 80 }));
        expect(played.noise).toBe(3);
    });

    test("plays the hum and the hiss", async ({ page, audio }) => {
        const hum = await audio.during(() => voice(page, "CRT hum").getByRole("checkbox").check());
        expect(hum.oscillators).toBeGreaterThan(0);
        const hiss = await audio.during(() =>
            voice(page, "Static hiss").getByRole("slider").first().fill("0.8"),
        );
        expect(hiss.loops).toBe(1);
    });

    test("writes edits as JSON, and keeps them", async ({ page }) => {
        await expect(page.getByRole("heading", { name: "No changes yet" })).toBeVisible();
        await voice(page, "Key click").getByRole("slider", { name: "Pitch (Hz)" }).fill("2500");
        await expect(voice(page, "Key click").locator(".row.edited")).toHaveCount(1);
        const edited = { sound: { voices: { key: { pitch: 2500 } } } };
        expect(JSON.parse(await output(page).innerText())).toEqual(edited);

        await page.reload();
        await expect(output(page)).toBeVisible();
        expect(JSON.parse(await output(page).innerText())).toEqual(edited);

        await page.getByRole("button", { name: "Reset everything" }).click();
        expect(JSON.parse(await output(page).innerText())).toEqual({ sound: { voices: {} } });
    });
});

test.describe("the custom tab", () => {
    const output = (page: Page) => page.locator("#panel-custom .output");
    const json = async (page: Page) => JSON.parse(await output(page).innerText());
    const panel = (page: Page) => page.locator("#panel-custom");

    test.beforeEach(async ({ page, audio: _ }) => {
        await page.goto("./?sound#custom");
        await expect(selectedTab(page)).toHaveText("Custom");
    });

    test("is in the address, and can be reached with the arrow keys", async ({ page }) => {
        await page.locator("#tab-custom").focus();
        await page.keyboard.press("ArrowLeft");
        await expect(selectedTab(page)).toHaveText("Built-in");
        await expect(page).toHaveURL(/#builtin$/);
        await page.keyboard.press("ArrowRight");
        await expect(selectedTab(page)).toHaveText("Custom");
        await page.reload();
        await expect(selectedTab(page)).toHaveText("Custom");
    });

    test("plays a preset, and writes it as JSON", async ({ page, audio }) => {
        const before = await json(page);
        const played = await audio.during(() =>
            panel(page).getByRole("button", { name: "Laser" }).click(),
        );
        expect(played.recipes).toBe(1);
        expect(await json(page)).not.toEqual(before);
    });

    test("mutates the sound", async ({ page, audio }) => {
        const before = await json(page);
        const played = await audio.during(() =>
            panel(page).getByRole("button", { name: "Mutate" }).click(),
        );
        expect(played.recipes).toBe(1);
        expect(await json(page)).not.toEqual(before);
    });

    test("plays a slider's change once it rests", async ({ page, audio }) => {
        const slider = panel(page).locator('input[type="range"]').first();
        const during = await audio.during(() => slider.fill("0.2"), 50);
        expect(during.recipes).toBe(0);
        await expect.poll(async () => (await audio.counts()).recipes).toBe(1);
    });

    test("names the sound", async ({ page }) => {
        await panel(page).getByLabel("Name").fill("airlock hiss");
        expect(Object.keys((await json(page)).sounds)).toEqual(["airlock-hiss"]);
    });

    test("loads a pasted sound", async ({ page }) => {
        const paste = page.locator(".paste");
        await paste.fill('{ "sounds": { "door": { "wave": "noise", "decay": 0.25 } } }');
        await page.getByRole("button", { name: "Load" }).click();
        expect(await json(page)).toEqual({ sounds: { door: { wave: "noise", decay: 0.25 } } });
    });

    test("explains a paste it can't load", async ({ page }) => {
        const paste = page.locator(".paste");
        await paste.fill("{ nope");
        await page.getByRole("button", { name: "Load" }).click();
        await expect(page.locator(".paste-error")).toHaveText("That isn't valid JSON");
        await paste.fill('{ "wave": "triangle" }');
        await page.getByRole("button", { name: "Load" }).click();
        await expect(page.locator(".paste-error")).not.toBeEmpty();
    });
});
