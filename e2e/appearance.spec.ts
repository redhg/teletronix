import type { Frame, Page } from "@playwright/test";
import { expect, type Program, test } from "./fixtures.ts";

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

    test("shows characters as others, only where they're shown", async ({ page, player }) => {
        await player.open({
            config: {
                name: "Characters",
                start: "home",
                reveal: "instant",
                characters: { "<": "(", ">": ")", "█": "#" },
                header: [{ left: "<BAR>" }],
            },
            screens: {
                home: {
                    content: [
                        "<OK> ██",
                        {
                            type: "prompt",
                            prompt: "> ",
                            commands: [{ command: "<go>", action: { screen: "there" } }],
                        },
                    ],
                },
                there: { content: ["THERE <"] },
            },
        });
        await expect(player.screen).toContainText("(OK) ##");
        await expect(page.locator(".bar-header")).toContainText("(BAR)");
        // screen readers get the text as written
        await expect(player.screen.locator(".sr-only").first()).toHaveText("<OK> ██");
        // what's typed is matched (and kept) as written
        const input = player.screen.locator(".prompt input");
        await input.fill("<go>");
        await expect(input).toHaveValue("<go>");
        await page.keyboard.press("Enter");
        await expect(player.screen).toContainText("THERE (");
    });

    test.describe("a theme with a look of its own", () => {
        test("brings its font, filled in with symbols, and its effects", async ({
            page,
            player,
        }) => {
            await player.open(withConfig({ theme: "vcr" }));
            const style = await styles(page);
            expect(style.background).toBe("rgb(21, 49, 201)");
            // (the symbol font straight after its font; WebKit leaves out the quotes)
            expect(style.fontFamily).toMatch(
                /"?Teletronix home-video"?, "?Teletronix symbols home-video"?/,
            );
            // a pixel font: whole multiples of its 20px
            expect(style.fontSize % 20).toBe(0);
            await expect
                .poll(() =>
                    page.evaluate(() =>
                        document.fonts.check('20px "Teletronix symbols home-video"', "█─┌"),
                    ),
                )
                .toBe(true);
            await expect(page.locator("canvas.static")).toBeAttached();
        });

        test("can show capitals, with no screen glow", async ({ page, player }) => {
            await player.open(withConfig({ theme: "lcd" }));
            const look = await page.evaluate(() => {
                const body = getComputedStyle(document.body);
                const root = getComputedStyle(document.documentElement);
                return {
                    transform: body.textTransform,
                    image: body.backgroundImage,
                    smoothing: root.getPropertyValue("--font-smoothing"),
                };
            });
            expect(look).toEqual({ transform: "uppercase", image: "none", smoothing: "auto" });
            // (only shown as capitals: the text is as written)
            await expect(player.screen).toContainText("RED ALERT");
        });

        test("can have bands behind the lines, like green-bar paper", async ({ page, player }) => {
            const bands = () =>
                page.locator(".terminal").evaluate((el) => getComputedStyle(el).backgroundImage);
            await player.open(withConfig({ theme: "printout" }));
            expect(await bands()).toContain("repeating-linear-gradient");
            await player.open(withConfig({ theme: "paper" }));
            expect(await bands()).toBe("none");
        });

        test("gives way to the program's own font and effects", async ({ page, player }) => {
            await player.open(
                withConfig({ theme: "vcr", font: "ibm-vga", effects: { static: false } }),
            );
            const style = await styles(page);
            expect(style.background).toBe("rgb(21, 49, 201)");
            expect(style.fontFamily).toContain("ibm-vga");
            expect(style.fontFamily).not.toContain("symbols");
            await expect(page.locator("canvas.static")).toHaveCount(0);
        });
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

    test.describe("on a phone", () => {
        test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });

        test("keeps text readable, crisp in the screen's own pixels", async ({ page, player }) => {
            // (Departure Mono is 11 pixels tall: 5 screen pixels each, at 3 to a CSS pixel)
            await player.open(withConfig({}));
            await expect.poll(async () => (await styles(page)).fontSize).toBeCloseTo(55 / 3, 1);
        });
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
