import { expect, type Program, serveTestImages, test } from "./fixtures.ts";

const slides = [["ALPHA"], ["BRAVO"], ["CHARLIE"]];

const program: Program = {
    config: { name: "Carousel", start: "home", variables: { page: 1 } },
    screens: {
        home: {
            content: [
                { type: "carousel", slides },
                "AFTER",
                { type: "carousel", variable: "page", loop: true, slides: [["ONE"], ["TWO"]] },
                "PAGE {page}",
                { type: "link", text: "> AWAY", action: { screen: "away" } },
            ],
        },
        away: { content: [{ type: "link", text: "> RETURN", action: { screen: "home" } }] },
    },
};

test.describe("carousel", () => {
    test("flips with its links, stopping at the ends", async ({ page, player }) => {
        await player.open(program);
        const first = page.locator(".carousel").first();
        await expect(first).toContainText("ALPHA");
        await expect(first.locator(".carousel-counter")).toHaveText("1/3");
        await expect(first.getByRole("button", { name: "Previous slide" })).toBeDisabled();
        // the screen carries on once the slide has revealed
        await expect(player.screen).toContainText("AFTER");

        const next = first.getByRole("button", { name: "Next slide" });
        await next.click();
        await expect(first).toContainText("BRAVO");
        await expect(first).not.toContainText("ALPHA");
        await next.click();
        await expect(first.locator(".carousel-counter")).toHaveText("3/3");
        await expect(next).toBeDisabled();
    });

    test("flips with the arrow keys: the first, or the one last used", async ({ page, player }) => {
        await player.open(program);
        const [first, second] = [
            page.locator(".carousel").first(),
            page.locator(".carousel").nth(1),
        ];
        await expect(player.screen).toContainText("PAGE 1");
        await page.keyboard.press("ArrowRight");
        await expect(first).toContainText("BRAVO");

        await second.getByRole("button", { name: "Next slide" }).click();
        await expect(second).toContainText("TWO");
        // its variable follows it
        await expect(player.screen).toContainText("PAGE 2");
        await page.keyboard.press("ArrowRight");
        // (it loops)
        await expect(second).toContainText("ONE");
        await expect(first).toContainText("BRAVO");
    });

    test("remembers its slide when you come back", async ({ page, player }) => {
        await player.open(program);
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await expect(page.locator(".carousel").first()).toContainText("CHARLIE");
        await player.link("> AWAY").click();
        await player.link("> RETURN").click();
        await expect(page.locator(".carousel").first()).toContainText("CHARLIE");
    });

    test("plays by itself until the player flips it", async ({ page, player }) => {
        await player.open({
            config: { name: "Autoplay", start: "home" },
            screens: { home: { content: [{ type: "carousel", autoplay: 500, slides }] } },
        });
        const carousel = page.locator(".carousel");
        await expect(carousel).toContainText("BRAVO");
        await expect(carousel).toContainText("CHARLIE");
        await carousel.getByRole("button", { name: "Previous slide" }).click();
        await expect(carousel).toContainText("BRAVO");
        await page.waitForTimeout(1000);
        await expect(carousel).toContainText("BRAVO");
    });

    test("keeps the height of its tallest slide so far", async ({ page, player }) => {
        await player.open({
            config: { name: "Heights", start: "home" },
            screens: {
                home: {
                    content: [
                        { type: "carousel", slides: [["SHORT"], ["TALL", "", "", "", "END"]] },
                        "BELOW",
                    ],
                },
            },
        });
        const below = player.screen.locator(".text", { hasText: "BELOW" }).last();
        await expect(below).toBeVisible();
        await page.keyboard.press("ArrowRight");
        await expect(page.locator(".carousel")).toContainText("END");
        const tall = (await below.boundingBox())?.y ?? 0;
        await page.keyboard.press("ArrowLeft");
        await expect(page.locator(".carousel")).toContainText("SHORT");
        expect((await below.boundingBox())?.y).toBeCloseTo(tall, 0);
    });

    test("centers its slides' images and text with align", async ({ page, player }) => {
        await serveTestImages(page);
        await player.open({
            config: { name: "Align", start: "home" },
            screens: {
                home: {
                    content: [
                        {
                            type: "carousel",
                            align: "center",
                            slides: [
                                [
                                    {
                                        type: "bitmap",
                                        src: "e2e-images/sunset-grid.png",
                                        alt: "GRID",
                                        cols: 10,
                                    },
                                    "MIDDLE",
                                ],
                            ],
                        },
                    ],
                },
            },
        });
        const slide = await page.locator(".carousel-slide").boundingBox();
        const image = await page.locator(".carousel-slide canvas").boundingBox();
        if (!slide || !image) throw new Error("no slide or image");
        const middle = (box: { x: number; width: number }) => box.x + box.width / 2;
        expect(Math.abs(middle(image) - middle(slide))).toBeLessThan(2);
        await expect(page.locator(".carousel-slide .text").last()).toHaveText(/\s{10,}MIDDLE$/);
    });

    test("flips with the arrow keys while a pause waits, and a key carries on", async ({
        page,
        player,
    }) => {
        await player.open({
            config: { name: "Pause", start: "home" },
            screens: {
                home: { content: [{ type: "carousel", slides }, { type: "pause" }, "MORE"] },
            },
        });
        await expect(page.locator(".pause")).toBeVisible();
        await page.keyboard.press("ArrowRight");
        await expect(page.locator(".carousel")).toContainText("BRAVO");
        await expect(player.screen).not.toContainText("MORE");
        await page.keyboard.press("Space");
        await expect(player.screen).toContainText("MORE");
    });
});
