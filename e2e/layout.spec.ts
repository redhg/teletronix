import { expect, type Locator, oneScreen, type Page, type Program, test } from "./fixtures.ts";

const PARAGRAPH =
    "Engine-side word wrap breaks the text between words to fit the window, so a reveal never " +
    "jumps a word from one line to the next as it types. Resize the window and it wraps again.";

/** The lines a text element is drawn on. */
const lines = (text: Locator) =>
    text.locator('[aria-hidden="true"]').evaluate((drawn) => (drawn.textContent ?? "").split("\n"));

test("text wraps to the window, and again when it's resized", async ({ page, player }) => {
    await player.open(oneScreen([PARAGRAPH]));
    const text = player.screen.locator(".text");
    const longest = async () => Math.max(...(await lines(text)).map((line) => line.length));
    const wide = await longest();
    await page.setViewportSize({ width: 320, height: 700 });
    await expect.poll(longest).toBeLessThan(wide);

    const narrow = await lines(text);
    // between words, and nothing lost
    expect(narrow.join(" ").replace(/\s+/g, " ").trim()).toBe(PARAGRAPH);
    for (const line of narrow) expect(line.startsWith(" ")).toBe(false);
    const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);
});

test.describe("autoscroll", () => {
    test.use({ reducedMotion: "no-preference", viewport: { width: 900, height: 400 } });

    const program: Program = {
        config: { name: "Autoscroll", start: "home" },
        screens: {
            home: {
                reveal: { type: "teletype", speed: 4 },
                content: [
                    ...Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a tall screen.`),
                    { type: "link", text: "> NEXT", action: { screen: "next" } },
                ],
            },
            next: { reveal: "instant", content: ["THE NEXT SCREEN"] },
        },
    };

    /** Whether the typing cursor is inside the window. */
    const cursorInView = (page: Page) =>
        page.evaluate(() => {
            const cursor = document.querySelector(".screen .reveal-cursor:not(:empty)");
            if (!cursor) return null;
            const box = cursor.getBoundingClientRect();
            return box.top >= 0 && box.bottom <= window.innerHeight;
        });

    test("follows the text as it types", async ({ page, player }) => {
        await player.open(program);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        for (let i = 0; i < 3; i++) {
            expect(await cursorInView(page)).not.toBe(false);
            await page.waitForTimeout(200);
        }
    });

    test("stops when the reader scrolls up, and resumes at the bottom", async ({
        page,
        player,
    }) => {
        await player.open(program);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
        await page.mouse.wheel(0, -5000);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);

        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(500);
        expect(await cursorInView(page)).not.toBe(false);
    });

    test("starts a new screen at the top", async ({ page, player }) => {
        await player.open(program);
        await player.tap();
        const next = player.link("> NEXT");
        await expect(next).toBeInViewport();
        await next.click();
        await expect(player.screen).toContainText("THE NEXT SCREEN");
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });

    test("can be turned off", async ({ page, player }) => {
        await player.open({ ...program, config: { ...program.config, autoscroll: false } });
        await page.waitForTimeout(1500);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
});
