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

test.describe("alignment and preformatted text", () => {
    const ART = ["+--------+", "|  ART   |", "+--------+"];
    const program: Program = {
        config: { name: "Align", start: "home" },
        screens: {
            home: {
                content: [
                    { type: "text", text: "CENTERED TITLE", align: "center" },
                    { type: "text", text: ART, wrap: false, align: "center" },
                    { type: "text", text: `WIDE ${"=".repeat(300)} END`, wrap: false },
                    {
                        type: "link",
                        text: "> CENTERED LINK",
                        align: "center",
                        action: { screen: "home" },
                    },
                ],
            },
        },
    };

    /** Where each line of an element's drawn text starts and ends on the page. */
    const lineBoxes = (text: Locator) =>
        text.locator('[aria-hidden="true"]').evaluate((drawn) => {
            const node = drawn.firstChild?.firstChild ?? drawn.firstChild;
            const content = drawn.textContent ?? "";
            const boxes: { left: number; right: number }[] = [];
            let offset = 0;
            for (const line of content.split("\n")) {
                const start = offset + line.length - line.trimStart().length;
                const end = offset + line.trimEnd().length;
                const range = document.createRange();
                // the visible span holds the whole text once revealed
                const textNode = drawn.querySelector("span")?.firstChild ?? node;
                if (textNode) {
                    range.setStart(textNode, start);
                    range.setEnd(textNode, end);
                    const box = range.getBoundingClientRect();
                    boxes.push({ left: box.left, right: box.right });
                }
                offset += line.length + 1;
            }
            return boxes;
        });

    const screenBox = async (player: import("./fixtures.ts").Player) => {
        const box = await player.screen.boundingBox();
        if (!box) throw new Error("no screen");
        return box;
    };

    test("centers text on the screen, in whole columns", async ({ player }) => {
        await player.open(program);
        const [title] = await lineBoxes(player.screen.locator(".text").nth(0));
        const screen = await screenBox(player);
        const charWidth = ((title?.right ?? 0) - (title?.left ?? 0)) / "CENTERED TITLE".length;
        const middle = ((title?.left ?? 0) + (title?.right ?? 0)) / 2;
        // within a column of the middle (a line can't sit between two columns)
        expect(Math.abs(middle - (screen.x + screen.width / 2))).toBeLessThanOrEqual(charWidth);
    });

    test("moves a block as one, keeping its shape", async ({ player }) => {
        await player.open(program);
        const lines = await lineBoxes(player.screen.locator(".text").nth(1));
        expect(lines).toHaveLength(3);
        const lefts = new Set(lines.map((line) => Math.round(line.left)));
        expect(lefts.size).toBe(1);
    });

    test("keeps preformatted lines whole, cut off at the edge", async ({ page, player }) => {
        await player.open(program);
        const wide = player.screen.locator(".text").nth(2).locator('[aria-hidden="true"]');
        const drawn = await wide.evaluate((element) => element.textContent ?? "");
        expect(drawn).toContain("END");
        expect(drawn).not.toContain("\n");
        const overflows = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(overflows).toBe(false);
    });

    test("centers a link's text, with its bar still full width", async ({ player }) => {
        await player.open(program);
        const link = player.link("> CENTERED LINK");
        const [text] = await lineBoxes(link);
        const box = await link.boundingBox();
        const screen = await screenBox(player);
        expect(box?.width).toBeCloseTo(screen.width, 0);
        expect((text?.left ?? 0) - screen.x).toBeGreaterThan(screen.width / 4);
    });

    test("centers again when the window is resized", async ({ page, player }) => {
        await player.open(program);
        const title = player.screen.locator(".text").nth(0);
        const before = (await lineBoxes(title))[0]?.left ?? 0;
        await page.setViewportSize({ width: 500, height: 700 });
        await expect.poll(async () => (await lineBoxes(title))[0]?.left ?? 0).toBeLessThan(before);
        const [after] = await lineBoxes(title);
        const screen = await screenBox(player);
        const middle = ((after?.left ?? 0) + (after?.right ?? 0)) / 2;
        expect(Math.abs(middle - (screen.x + screen.width / 2))).toBeLessThan(20);
    });
});
