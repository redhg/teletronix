import { expect, type Program, test } from "./fixtures.ts";

const lines = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);

const program: Program = {
    config: { name: "Frames", start: "home" },
    screens: {
        home: {
            content: [
                {
                    type: "frames",
                    frames: [
                        { title: "LEFT", rows: 4, content: lines("LEFT LINE", 12) },
                        { title: "RIGHT", rows: 4, content: lines("RIGHT LINE", 2) },
                    ],
                },
                "AFTER",
            ],
        },
    },
};

const box = async (locator: import("@playwright/test").Locator) => {
    const found = await locator.boundingBox();
    if (!found) throw new Error("not on screen");
    return found;
};

test.describe("frames", () => {
    test.use({ viewport: { width: 1000, height: 700 } });

    test("sit side by side, in borders with their titles, then the screen carries on", async ({
        player,
    }) => {
        await player.open(program);
        const frames = player.screen.locator(".frame");
        await expect(frames).toHaveCount(2);
        const [left, right] = [await box(frames.nth(0)), await box(frames.nth(1))];
        expect(right.x).toBeGreaterThan(left.x + left.width - 1);
        expect(Math.abs(right.y - left.y)).toBeLessThan(1);
        await expect(frames.nth(0).locator(".frame-title")).toHaveText("LEFT");
        await expect(player.screen.getByRole("region", { name: "RIGHT" })).toContainText(
            "RIGHT LINE 2",
        );
        await expect(player.screen).toContainText("AFTER");
    });

    test("scroll by themselves to their newest line, showing there's more above", async ({
        player,
    }) => {
        await player.open(program);
        await expect(player.screen).toContainText("AFTER");
        const left = player.screen.locator(".frame").nth(0);
        const scroller = left.locator(".frame-scroll");
        const last = left.locator(".text", { hasText: "LEFT LINE 12" }).last();
        const [view, line] = [await box(scroller), await box(last)];
        expect(line.y + line.height).toBeLessThanOrEqual(view.y + view.height + 1);
        await expect(left.locator(".frame-side").last()).toContainText("▲");
        await expect(left.locator(".frame-side").last()).not.toContainText("▼");
        // the short one doesn't scroll
        await expect(player.screen.locator(".frame").nth(1)).not.toContainText("▲");
    });

    test("scroll with the keys once they have the keyboard", async ({ page, player }) => {
        await player.open(program);
        await expect(player.screen).toContainText("AFTER");
        const scroller = player.screen.locator(".frame-scroll").first();
        await scroller.focus();
        await page.keyboard.press("Home");
        await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
        await expect(player.screen.locator(".frame-side").nth(1)).toContainText("▼");
    });

    test("stop following when scrolled back, and follow again at the bottom", async ({
        page,
        player,
    }) => {
        await player.open({
            config: { name: "Feed", start: "home" },
            screens: {
                home: {
                    content: [
                        {
                            type: "frames",
                            frames: [
                                {
                                    rows: 3,
                                    content: [
                                        ...lines("OLD", 6),
                                        { type: "log", lines: lines("NEW", 40), interval: 300 },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
        });
        const scroller = player.screen.locator(".frame-scroll");
        await expect(scroller).toContainText("NEW 2");
        await scroller.evaluate((el) => {
            el.scrollTop = 0;
        });
        await page.waitForTimeout(1000);
        expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);

        await scroller.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
        });
        const bottom = () =>
            scroller.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
        await page.waitForTimeout(1000);
        expect(await bottom()).toBe(true);
    });

    test("stack on a narrow screen, each the whole width", async ({ page, player }) => {
        await page.setViewportSize({ width: 360, height: 700 });
        await player.open(program);
        const frames = player.screen.locator(".frame");
        const [left, right] = [await box(frames.nth(0)), await box(frames.nth(1))];
        expect(right.y).toBeGreaterThan(left.y + left.height - 1);
        expect(Math.abs(right.width - left.width)).toBeLessThan(1);
    });
});
