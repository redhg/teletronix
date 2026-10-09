import { expect, type Program, serveTestImages, test } from "./fixtures.ts";

const IMAGE = "e2e-images/sunset-grid.png";
const VIDEO = "e2e-images/tape.webm";

const program: Program = {
    config: { name: "Mosaic", start: "home", reveal: "instant", variables: { fixed: false } },
    screens: {
        home: {
            content: [
                {
                    type: "mosaic",
                    across: 2,
                    overlay: { top: "SECURITY", bottom: "[alert]● REC[/]" },
                    tiles: [
                        { src: VIDEO, label: "CAM 1", clock: "03:14:07" },
                        { src: IMAGE, label: "CAM 2", action: { view: IMAGE } },
                        { label: "CAM 3", signal: false, static: true },
                        { src: VIDEO, label: "CAM 4", signal: { fixed: true } },
                    ],
                },
                { type: "toggle", states: ["[ ] FIXED", "[X] FIXED"], variable: "fixed" },
                {
                    type: "link",
                    text: "> DESK",
                    action: { view: { mosaic: { tiles: [{ src: IMAGE, label: "ONLY CAM" }] } } },
                },
            ],
        },
    },
};

test.describe("a mosaic", () => {
    test.beforeEach(async ({ page }) => {
        await serveTestImages(page);
    });

    test("shows its feeds, labelled, with no signal where there's none", async ({ player }) => {
        await player.open(program);
        const tiles = player.screen.locator(".mosaic-tile");
        await expect(tiles).toHaveCount(4);
        await expect(tiles.nth(0).locator("video")).toBeAttached();
        await expect(tiles.nth(0)).toContainText("CAM 1");
        await expect(tiles.nth(1).locator("img")).toHaveAttribute("src", IMAGE);
        await expect(tiles.nth(2)).toContainText("NO SIGNAL");
        await expect(tiles.nth(2).locator(".mosaic-noise")).toBeAttached();
        // no static asked for: dark
        await expect(tiles.nth(3)).toContainText("NO SIGNAL");
        await expect(tiles.nth(3).locator(".mosaic-noise")).toHaveCount(0);
        await expect(player.screen.locator(".mosaic-overlay-top")).toHaveText("SECURITY");
        await expect(player.screen.locator(".mosaic-overlay-bottom .alert")).toHaveText("● REC");
    });

    test("runs its clocks from where they start", async ({ player }) => {
        await player.open(program);
        const clock = player.screen.locator(".mosaic-clock").first();
        await expect(clock).toHaveText("03:14:07");
        await expect(clock).toHaveText("03:14:08", { timeout: 3000 });
    });

    test("gets a signal when its condition holds", async ({ player }) => {
        await player.open(program);
        const cam4 = player.screen.locator(".mosaic-tile").nth(3);
        await player.screen.locator(".toggle").click();
        await expect(cam4.locator("video")).toBeAttached();
        await expect(cam4).not.toContainText("NO SIGNAL");
    });

    test("does what a tile says, and shows the whole monitor over the window", async ({
        page,
        player,
    }) => {
        await player.open(program);
        await player.screen.getByRole("button", { name: "CAM 2" }).click();
        await expect(page.getByRole("dialog", { name: "Image" })).toBeVisible();
        await page.keyboard.press("Escape");

        await player.screen.getByRole("button", { name: /over the whole screen/ }).click();
        const monitor = page.getByRole("dialog", { name: "Monitor" });
        await expect(monitor.locator(".mosaic-tile")).toHaveCount(4);
        await page.keyboard.press("Escape");

        // a view can be a mosaic too
        await player.link("> DESK").click();
        await expect(page.getByRole("dialog", { name: "Monitor" })).toContainText("ONLY CAM");
    });
});
