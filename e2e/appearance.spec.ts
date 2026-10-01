import { readFile } from "node:fs/promises";
import type { Frame, Page } from "@playwright/test";
import { expect, type Player, type Program, test } from "./fixtures.ts";

const program: Program = {
    config: { name: "Appearance", start: "home" },
    screens: {
        home: { content: ["HOME", { type: "text", text: "RED ALERT", className: "alert" }] },
    },
};

const withConfig = (config: Partial<Program["config"]>): Program => ({
    ...program,
    config: { ...program.config, ...config },
});

const styles = (page: Page | Frame) =>
    page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const body = getComputedStyle(document.body);
        return {
            fg: root.getPropertyValue("--fg"),
            bg: root.getPropertyValue("--bg"),
            color: body.color,
            background: body.backgroundColor,
            fontFamily: body.fontFamily,
            fontSize: Number.parseFloat(body.fontSize),
        };
    });

test.describe("the player", () => {
    test("uses the program's theme", async ({ page, player }) => {
        await player.open(withConfig({ theme: "amber" }));
        const style = await styles(page);
        expect(style.fg).toBe("#e07d0b");
        expect(style.color).toBe("rgb(224, 125, 11)");
        expect(style.background).toBe("rgb(8, 4, 0)");
    });

    test("uses the program's own colors", async ({ page, player }) => {
        await player.open(
            withConfig({ theme: { fg: "#33ff66", bg: "#001100", alert: "#ffff00" } }),
        );
        expect((await styles(page)).color).toBe("rgb(51, 255, 102)");
        await expect(player.screen.locator(".alert")).toHaveCSS("color", "rgb(255, 255, 0)");
    });

    test("uses the program's font, at a crisp size", async ({ page, player }) => {
        await player.open(withConfig({ font: "ibm-ega" }));
        const style = await styles(page);
        expect(style.fontFamily).toContain("ibm-ega");
        // whole multiples of the font's pixel height (14px) keep its pixels square
        expect(style.fontSize % 14).toBe(0);
        await expect
            .poll(() => page.evaluate(() => document.fonts.check('14px "Teletronix ibm-ega"')))
            .toBe(true);
    });

    test("can use a font installed on the computer, smoothed, at any size", async ({
        page,
        player,
    }) => {
        await player.open(withConfig({ font: "courier-new" }));
        const style = await styles(page);
        expect(style.fontFamily).toContain("Courier New");
        expect(style.fontFamily).toContain("monospace");
        expect(style.fontSize).toBe(Math.round(style.fontSize));
        // smoothed, unlike the pixel fonts (in the browsers that can turn smoothing off)
        const smoothing = await page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue("--font-smoothing"),
        );
        expect(smoothing).toBe("auto");
        await expect(player.screen).toContainText("HOME");
    });

    test("scales text, in steps of a pixel font's pixels", async ({ page, player }) => {
        // (a 1000px window aims for 32px text; IBM VGA is 16 pixels tall)
        await player.open(withConfig({ font: "ibm-vga", fontScale: 1.5 }));
        expect((await styles(page)).fontSize).toBe(48);
        await player.open(withConfig({ font: "ibm-vga", fontScale: 0.5 }));
        expect((await styles(page)).fontSize).toBe(16);
        await player.open(withConfig({ font: "courier-new", fontScale: 1.25 }));
        expect((await styles(page)).fontSize).toBe(40);
    });

    test("spaces lines by lineSpacing", async ({ page, player }) => {
        const spacing = () =>
            page.evaluate(() => {
                const body = getComputedStyle(document.body);
                return Number.parseFloat(body.lineHeight) / Number.parseFloat(body.fontSize);
            });
        await player.open(withConfig({ font: "ibm-vga" }));
        expect(await spacing()).toBeCloseTo(1.25, 1);
        await player.open(withConfig({ font: "ibm-vga", lineSpacing: 1 }));
        expect(await spacing()).toBe(1);
    });

    test("sets the page title", async ({ page, player }) => {
        await player.open(program);
        await expect(page).toHaveTitle("Appearance");
    });
});

test.describe("the settings page", () => {
    test.use({ viewport: { width: 1300, height: 800 } });

    const open = async (page: Page, player: Player) => {
        await player.page.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        await page.goto("./?data=e2e&config");
        await expect(preview(page).locator(".screen")).toContainText("HOME");
    };
    const preview = (page: Page) => page.frameLocator(".settings-preview");
    const previewFrame = (page: Page) => {
        const frame = page.frames().find((candidate) => candidate.url().includes("preview"));
        if (!frame) throw new Error("no preview");
        return frame;
    };
    const output = (page: Page) => page.locator(".output");

    test("starts from the program's settings", async ({ page, player }) => {
        await open(page, player);
        await expect(output(page)).toHaveText("{} (all defaults)");
    });

    test("previews a theme and font, and writes their JSON", async ({ page, player }) => {
        await open(page, player);
        await page.getByLabel("Theme").selectOption("amber");
        await page.getByLabel("Typeface").selectOption("ibm-ega");
        await expect.poll(async () => (await styles(previewFrame(page))).fg).toBe("#e07d0b");
        await expect
            .poll(async () => (await styles(previewFrame(page))).fontFamily)
            .toContain("ibm-ega");
        const json = JSON.parse(await output(page).innerText());
        expect(json).toMatchObject({ theme: "amber", font: "ibm-ega" });
    });

    test("previews custom colors", async ({ page, player }) => {
        await open(page, player);
        await page.getByLabel("Theme").selectOption("custom");
        await page.locator('input[type="color"]').first().fill("#33ff66");
        await expect.poll(async () => (await styles(previewFrame(page))).fg).toBe("#33ff66");
        expect(JSON.parse(await output(page).innerText()).theme.fg).toBe("#33ff66");
    });

    test("previews a text size, and writes its JSON", async ({ page, player }) => {
        await open(page, player);
        await page.getByLabel("Typeface").selectOption("ibm-vga");
        const slider = page.getByLabel("Text size");
        await slider.fill("1.5");
        await expect
            .poll(async () => (await styles(previewFrame(page))).fontSize)
            .toBeGreaterThan(40);
        expect(JSON.parse(await output(page).innerText())).toMatchObject({ fontScale: 1.5 });
        await expect(page.locator(".hint", { hasText: "Text is" })).toContainText(
            "px in the preview",
        );
    });

    test("previews line spacing, and writes its JSON", async ({ page, player }) => {
        await open(page, player);
        await page.getByLabel("Line spacing").fill("1");
        await expect
            .poll(() =>
                previewFrame(page).evaluate(() => {
                    const body = getComputedStyle(document.body);
                    return Number.parseFloat(body.lineHeight) / Number.parseFloat(body.fontSize);
                }),
            )
            .toBe(1);
        expect(JSON.parse(await output(page).innerText())).toMatchObject({ lineSpacing: 1 });
    });

    test("previews effects", async ({ page, player }) => {
        await open(page, player);
        await page
            .locator("fieldset.effect", { hasText: "Vignette" })
            .locator("legend input")
            .check();
        await expect(preview(page).locator(".effects .vignette")).toHaveCount(1);
        expect(JSON.parse(await output(page).innerText()).effects).toMatchObject({
            vignette: true,
        });
    });

    test("downloads the program with the settings in place", async ({ page, player }) => {
        await open(page, player);
        await page.getByLabel("Theme").selectOption("green");
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.getByRole("button", { name: "Download e2e.json" }).click(),
        ]);
        const file = JSON.parse(await readFile(await download.path(), "utf8"));
        expect(file.config).toEqual({ ...program.config, theme: "green" });
        expect(file.screens).toEqual(program.screens);
    });

    test("resets to the program's settings", async ({ page, player }) => {
        await open(page, player);
        await page.getByLabel("Theme").selectOption("white");
        await page.getByRole("button", { name: "Reset" }).click();
        await expect(output(page)).toHaveText("{} (all defaults)");
    });
});
