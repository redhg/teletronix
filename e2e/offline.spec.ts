import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

test.use({ serviceWorkers: "allow" });

/** Loads a page, and waits until everything is cached for offline use. */
async function install(page: Page) {
    await page.goto("./?data=sample");
    await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        // "ready" means active, which the service worker only becomes once it has cached everything
        return registration.active?.state;
    });
}

test.describe("offline", () => {
    // Playwright's WebKit fails with "internal error" reloading offline under a service worker
    test.skip(({ browserName }) => browserName === "webkit");

    test("plays every program, with its images, without a network", async ({
        page,
        context,
        player,
    }) => {
        await install(page);
        await context.setOffline(true);

        await page.reload();
        await expect(player.screen).toContainText("TELETRONIX // SAMPLE PROGRAM");
        await player.link("> IMAGES").click();
        await expect(player.screen.locator(".bitmap canvas").first()).toBeVisible();
        await expect(player.screen).not.toContainText("IMAGE UNAVAILABLE");

        await page.goto("./?data=ypsilon14");
        await expect(player.screen).not.toBeEmpty();
        await page.goto("./?sound");
        await expect(page.locator(".voice").first()).toBeVisible();
    });
});

test("can be installed as an app", async ({ page, request }) => {
    await page.goto("./?data=sample");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    const manifest = await (await request.get(href ?? "")).json();
    expect(manifest).toMatchObject({
        name: "Teletronix",
        start_url: "./",
        display: "fullscreen",
    });
    for (const icon of manifest.icons) {
        const response = await request.get(`icons/${icon.src.split("/").at(-1)}`);
        expect(response.ok()).toBe(true);
        expect(response.headers()["content-type"]).toBe("image/png");
    }
});

test("opens the last program played, when installed", async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: "block" });
    // as an installed app sees it
    await context.addInitScript(() => {
        const real = window.matchMedia.bind(window);
        window.matchMedia = (query: string) =>
            query.includes("display-mode")
                ? ({ ...real(query), matches: true } as MediaQueryList)
                : real(query);
    });
    const page = await context.newPage();
    await page.goto("./?data=ypsilon14&kiosk");
    await expect(page.locator(".kiosk-gate")).toBeVisible();

    await page.goto("./");
    await expect(page).toHaveURL(/\?data=ypsilon14&kiosk$/);
    await expect(page.locator(".kiosk-gate")).toBeVisible();
    await context.close();
});
