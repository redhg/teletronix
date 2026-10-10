import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures.ts";

// Which build this is: `teletronix.version` in the console, and `?version`, which compares it
// with the one online now.

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("teletronix.version names this build, from any page", async ({ page, player }) => {
    await player.open("sample", "#home");
    const named = await page.evaluate(
        () => (window as unknown as { teletronix: { version: string } }).teletronix.version,
    );
    expect(named).toMatch(
        new RegExp(
            `^${version.replaceAll(".", "\\.")} \\(\\w+, built \\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d UTC\\)$`,
        ),
    );
});

test.describe("?version", () => {
    test("says when this browser has the build that's online", async ({ page }) => {
        await page.goto("./?version");
        const view = page.locator(".version-view");
        await expect(view).toContainText("THIS BROWSER");
        await expect(view.getByRole("status")).toHaveText("UP TO DATE.");
        const [here, online] = await view.locator("dd").allInnerTexts();
        expect(here).toBe(online);
        await expect(view.getByRole("link", { name: "> PLAY" })).toHaveAttribute("href", "./");
    });

    test("says when the one online is newer", async ({ page }) => {
        await page.route("**/version.json*", (route) =>
            route.fulfill({
                json: { version: "9.9.9", commit: "abcdef1", built: "2030-01-01T00:00:00Z" },
            }),
        );
        await page.goto("./?version");
        const view = page.locator(".version-view");
        await expect(view).toContainText("9.9.9 (abcdef1, built 2030-01-01 00:00 UTC)");
        await expect(view.getByRole("status")).toContainText("OUT OF DATE");
    });

    test.describe(() => {
        // (the server not answering is the point)
        test.use({ expectedErrors: [/Failed to load resource/] });

        test("says when it couldn't check", async ({ page }) => {
            await page.route("**/version.json*", (route) => route.abort());
            await page.goto("./?version");
            await expect(page.locator(".version-view").getByRole("status")).toContainText(
                "COULDN'T CHECK",
            );
        });
    });
});
