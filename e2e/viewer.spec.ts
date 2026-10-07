import { expect, type Program, serveTestImages, test } from "./fixtures.ts";

const IMAGE = "e2e-images/sunset-grid.png";
const VIDEO = "e2e-images/tape.webm";

const program: Program = {
    config: { name: "Viewer", start: "home", reveal: "instant" },
    screens: {
        home: {
            content: [
                "HOME",
                {
                    type: "link",
                    text: "> PHOTO",
                    action: { view: { src: IMAGE, caption: "A SUNSET" } },
                },
                {
                    type: "link",
                    text: "> TAPE",
                    action: { view: { src: VIDEO, osd: true, onEnd: { screen: "after" } } },
                },
                {
                    type: "link",
                    text: "> LOOP",
                    action: { view: { src: VIDEO, loop: true, onEnd: { screen: "after" } } },
                },
            ],
            next: [{ key: "x", action: { screen: "after" } }],
        },
        after: { content: ["AFTER THE TAPE"] },
        clip: {
            content: ["A CLIP", { type: "video", src: VIDEO, alt: "A TEST TAPE", cols: 20 }],
        },
    },
};

test.describe("the full-window viewer", () => {
    test.beforeEach(async ({ page }) => {
        await serveTestImages(page);
    });

    test("shows an image over everything, until BACK or Esc", async ({ page, player }) => {
        await player.open(program);
        const viewer = page.getByRole("dialog", { name: "A SUNSET" });
        await player.link("> PHOTO").click();
        await expect(viewer).toBeVisible();
        await expect(viewer.locator("img")).toHaveAttribute("src", IMAGE);
        await expect(viewer).toContainText("A SUNSET");
        // the screen's keys wait
        await page.keyboard.press("x");
        await expect(player.screen).toContainText("HOME");
        // the effects are on the same glass, over it
        await expect(viewer.locator(".effects")).toBeAttached();

        await page.keyboard.press("Escape");
        await expect(viewer).toHaveCount(0);
        await player.link("> PHOTO").click();
        await viewer.getByRole("button", { name: "BACK" }).click();
        await expect(viewer).toHaveCount(0);
        await expect(player.screen).toContainText("HOME");
    });

    test("plays a video, with a VCR's display, then does what it says", async ({
        page,
        player,
    }) => {
        await player.open(program);
        await player.link("> TAPE").click();
        const viewer = page.getByRole("dialog", { name: "Video" });
        await expect(viewer.locator(".viewer-osd")).toContainText(/PLAY ►|PAUSE ‖/);
        // a second long: then on to the next screen
        await expect(player.screen).toContainText("AFTER THE TAPE", { timeout: 10_000 });
        await expect(viewer).toHaveCount(0);
    });

    test("loops a video until it's closed", async ({ page, player }) => {
        await player.open(program);
        await player.link("> LOOP").click();
        const viewer = page.getByRole("dialog", { name: "Video" });
        await expect(viewer).toBeVisible();
        await page.waitForTimeout(2500);
        await expect(viewer).toBeVisible();
        await expect(player.screen).toContainText("HOME");
        await page.keyboard.press("Escape");
        await expect(viewer).toHaveCount(0);
    });

    test("plays a clip among the text, and shows it over the window on a click", async ({
        page,
        player,
    }) => {
        await player.open(program, "#clip");
        const clip = player.screen.locator(".video video");
        await expect(clip).toHaveAttribute("aria-label", "A TEST TAPE");
        // looping, silent, playing
        await expect
            .poll(() => clip.evaluate((video: HTMLVideoElement) => video.currentTime > 0))
            .toBe(true);
        expect(await clip.evaluate((video: HTMLVideoElement) => [video.loop, video.muted])).toEqual(
            [true, true],
        );
        await player.screen.getByRole("button", { name: /A TEST TAPE: show it/ }).click();
        await expect(page.getByRole("dialog", { name: "A TEST TAPE" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "A TEST TAPE" })).toHaveCount(0);
    });
});
