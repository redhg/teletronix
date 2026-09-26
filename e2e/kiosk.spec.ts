import type { Page } from "@playwright/test";
import { expect, type Program, test } from "./fixtures.ts";

const program: Program = {
    config: { name: "Station Terminal", start: "home", variables: { visits: 0 } },
    screens: {
        home: {
            content: [
                "HOME. VISITS: {visits}",
                {
                    type: "link",
                    text: "> AWAY",
                    action: { set: { visits: { add: 1 } }, screen: "away" },
                },
            ],
        },
        away: { content: ["AWAY", { type: "link", text: "> HOME", action: { screen: "home" } }] },
    },
};

/** Counts requests for full screen and wake locks, which headless browsers may refuse. */
function spy() {
    const calls = { fullscreen: 0, wakeLock: 0 };
    (window as unknown as { __kiosk: typeof calls }).__kiosk = calls;
    Element.prototype.requestFullscreen = () => {
        calls.fullscreen++;
        return Promise.resolve();
    };
    Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: {
            request: () => {
                calls.wakeLock++;
                return Promise.resolve({ release: () => Promise.resolve() });
            },
        },
    });
}

const calls = (page: Page) =>
    page.evaluate(() => (window as unknown as { __kiosk: Record<string, number> }).__kiosk);

test.beforeEach(async ({ page, player }) => {
    await page.addInitScript(spy);
    await page.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
    await page.goto("./?data=e2e&kiosk");
    await expect(page.locator(".kiosk-gate")).toContainText("Station Terminal");
    await expect(page.locator(".kiosk-gate")).toContainText("PRESS ANY KEY");
    await expect(player.screen).toHaveCount(0);
});

test("waits for a key before starting, then goes full screen and stays awake", async ({
    page,
    player,
}) => {
    // a modifier alone isn't a key press
    await page.keyboard.press("Shift");
    await expect(page.locator(".kiosk-gate")).toBeVisible();

    await page.keyboard.press("Space");
    await expect(player.screen).toContainText("HOME");
    expect(await calls(page)).toEqual({ fullscreen: 1, wakeLock: 1 });
});

test("starts with a tap", async ({ page, player }) => {
    await page.mouse.click(10, 10);
    await expect(player.screen).toContainText("HOME");
    expect((await calls(page)).fullscreen).toBe(1);
});

test.describe("once started", () => {
    test.beforeEach(async ({ page, player }) => {
        await page.keyboard.press("Enter");
        await expect(player.screen).toContainText("HOME");
    });

    test("restarts on Ctrl+Alt+R, with variables as new", async ({ page, player }) => {
        await player.link("> AWAY").click();
        await expect(player.screen).toContainText("AWAY");
        await page.keyboard.press("Control+Alt+KeyR");
        await expect(player.screen).toContainText("HOME. VISITS: 0");
    });

    test("can't be selected or zoomed with the keyboard", async ({ page }) => {
        await expect(page.locator("html")).toHaveCSS("user-select", "none");
        const zoomBlocked = await page.evaluate(() => {
            const event = new KeyboardEvent("keydown", {
                key: "=",
                ctrlKey: true,
                cancelable: true,
            });
            window.dispatchEvent(event);
            return event.defaultPrevented;
        });
        expect(zoomBlocked).toBe(true);
    });

    test("hides the pointer when it's still", async ({ page }) => {
        const html = page.locator("html");
        await page.mouse.move(200, 200);
        await expect(html).not.toHaveAttribute("data-cursor-hidden");
        await expect(html).toHaveAttribute("data-cursor-hidden", "", { timeout: 5000 });
        await page.mouse.move(250, 250);
        await expect(html).not.toHaveAttribute("data-cursor-hidden");
    });

    test("asks before the page is left", async ({ page }) => {
        const dialog = page.waitForEvent("dialog");
        await page.close({ runBeforeUnload: true });
        expect((await dialog).type()).toBe("beforeunload");
    });
});

test("isn't on without ?kiosk", async ({ page, player }) => {
    await page.goto("./?data=e2e");
    await expect(player.screen).toContainText("HOME");
    await expect(page.locator(".kiosk-gate")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-kiosk");
});
