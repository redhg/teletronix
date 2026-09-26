import { expect, type Player, test } from "./fixtures.ts";

test.describe("a program that can't be played", () => {
    test.use({ expectedErrors: [/404|Failed to load/i] });

    test("is explained when it's missing", async ({ page }) => {
        await page.goto("./?data=no-such-program");
        await expect(page.locator(".error-view")).toContainText("no-such-program.json");
    });

    test("is explained when it's invalid", async ({ page }) => {
        await page.route("**/data/e2e.json", (route) =>
            route.fulfill({
                json: {
                    config: { name: "Broken", start: "home" },
                    screens: { home: { content: [{ type: "link", text: "> GO" }] } },
                },
            }),
        );
        await page.goto("./?data=e2e");
        const error = page.locator(".error-view");
        await expect(error).toContainText("e2e.json is invalid");
        await expect(error).toContainText("screens.home.content[0]");
        await expect(error).toContainText("action");
    });
});

/** A screen, known by the first line of its text. */
const title = async (player: Player) => (await player.text()).trim().split("\n")[0] ?? "";

/**
 * Follows every link (with a click and with a shift-click) from every screen it reaches,
 * closing any dialog on the way, so each screen gets drawn once without errors.
 */
async function crawl(player: Player, program: string): Promise<Set<string>> {
    const { page } = player;
    type Step = { link: number; shift: boolean };

    const closeDialogs = async () => {
        for (let i = 0; i < 3 && (await player.dialog.count()); i++) {
            await page.keyboard.press("Escape");
        }
    };
    const follow = async ({ link, shift }: Step) => {
        if (shift) await page.keyboard.down("Shift");
        await player.screen.locator("button.link").nth(link).click();
        if (shift) await page.keyboard.up("Shift");
        await closeDialogs();
    };
    const replay = async (path: Step[]) => {
        await player.open(program);
        for (const step of path) await follow(step);
    };

    const seen = new Set<string>();
    const queue: Step[][] = [[]];
    while (queue.length > 0) {
        const path = queue.shift() ?? [];
        await replay(path);
        const screen = await title(player);
        if (seen.has(screen)) continue;
        seen.add(screen);
        const links = await player.screen.locator("button.link").count();
        for (let link = 0; link < links; link++) {
            queue.push([...path, { link, shift: false }], [...path, { link, shift: true }]);
        }
    }
    return seen;
}

test.describe("the programs in public/data", () => {
    // a check of the content, not the browsers
    test.skip(({ browserName }) => browserName !== "chromium");
    test.slow();

    test("the sample draws every screen its links reach", async ({ player }) => {
        const screens = await crawl(player, "sample");
        expect(screens.size).toBeGreaterThan(20);
    });

    test("Ypsilon 14 draws every screen its links reach", async ({ player }) => {
        const screens = await crawl(player, "ypsilon14");
        expect(screens.size).toBeGreaterThan(10);
    });

    test("the Teletronix logo loads", async ({ player }) => {
        await player.open("teletronix");
        await expect(player.screen).not.toBeEmpty();
    });
});
