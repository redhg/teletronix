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

/** What the crawl follows: links, and menu items. */
const FOLLOW = 'button.link, [role="menuitem"]';

/** A screen, known by the first line of its text. */
const title = async (player: Player) => (await player.text()).trim().split("\n")[0] ?? "";

/**
 * Follows every link (with a click and with a shift-click) from every screen it reaches,
 * closing any dialog on the way, so each screen gets drawn once without errors.
 */
async function crawl(player: Player, program: string, start = ""): Promise<Set<string>> {
    const { page } = player;
    type Step = { link: number; shift: boolean };

    const closeDialogs = async () => {
        for (let i = 0; i < 3 && (await player.dialog.count()); i++) {
            await page.keyboard.press("Escape");
        }
    };
    const follow = async ({ link, shift }: Step) => {
        if (shift) await page.keyboard.down("Shift");
        await player.screen.locator(FOLLOW).nth(link).click();
        if (shift) await page.keyboard.up("Shift");
        await closeDialogs();
    };
    const replay = async (path: Step[]) => {
        // (going to the same address with the same #screen wouldn't load it again)
        await page.goto("about:blank");
        await player.open(program, start);
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
        const links = await player.screen.locator(FOLLOW).count();
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
        // (it replays the sample from the start for each link, and it has a lot of them)
        test.setTimeout(240_000);
        // (from the home screen: the sample starts up with a key press)
        const screens = await crawl(player, "sample", "#home");
        expect(screens.size).toBeGreaterThan(20);
    });

    test("Ypsilon 14 draws every screen its links reach", async ({ player }) => {
        const screens = await crawl(player, "ypsilon14");
        expect(screens.size).toBeGreaterThan(10);
    });

    test("Tape 7 draws every screen its links reach", async ({ player }) => {
        // (from the archive: it starts up with a key press)
        const screens = await crawl(player, "tape7", "#archive");
        expect(screens.size).toBeGreaterThan(5);
    });

    test("Tape 7 plays through: the search, the password, the buffer and the tape", async ({
        player,
    }) => {
        const { page } = player;
        await player.open("tape7", "#search");
        await expect(player.screen).toContainText("SEARCH:");
        await page.keyboard.type("03:14");
        await page.keyboard.press("Enter");
        await expect(player.screen).toContainText("CAM 3 BUFFER");

        // the password from tape 04, then the desk, with its camera dark
        await player.screen.getByRole("button", { name: "< BACK" }).click();
        await player.screen.getByRole("button", { name: "< BACK" }).click();
        await player.screen.getByRole("menuitem", { name: "3. SECURITY DESK" }).click();
        await expect(player.screen).toContainText("PASSWORD:");
        await page.keyboard.type("HALCYON");
        await page.keyboard.press("Enter");
        const airlock = player.screen.getByRole("button", { name: "CAM 3 · AIRLOCK" });
        await expect(airlock).toContainText("NO SIGNAL");

        // recovering it starts the purge
        await player.screen.getByRole("button", { name: "> RECOVER CAM 3 BUFFER" }).click();
        await player.dialog.getByRole("button", { name: "RECOVER" }).click();
        await expect(player.screen).toContainText(/ARCHIVE PURGE IN 01:[23]\d/);
        await player.screen.getByRole("button", { name: "> SECURITY DESK" }).click();
        await expect(airlock).not.toContainText("NO SIGNAL");

        // and the tape, to its end
        await airlock.click();
        const video = page.getByRole("dialog", { name: "Video" }).locator("video");
        await expect(video).toHaveAttribute("src", /tape07\.mp4$/);
        await video.evaluate((element: HTMLVideoElement) => {
            element.currentTime = element.duration - 0.2;
        });
        await expect(player.screen).toContainText("END OF TAPE 07", { timeout: 10_000 });
    });

    test("the Teletronix logo loads", async ({ player }) => {
        await player.open("teletronix");
        await expect(player.screen).not.toBeEmpty();
    });
});
