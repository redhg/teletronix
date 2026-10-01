import { expect, type Page, type Program, test } from "./fixtures.ts";

const bars: Program = {
    config: {
        name: "Bars",
        start: "home",
        variables: { credits: 0 },
        header: [{ left: "RELAY", right: "SECTOR 14" }],
        footer: [
            {
                left: "STATUS OK",
                center: "CREDITS: {credits}",
                right: { text: "[?] HELP", action: { dialog: "help" } },
            },
        ],
    },
    screens: {
        home: {
            content: [
                "TOP LINE",
                ...Array.from({ length: 30 }, (_, i) => `Filler line ${i + 1}.`),
                { type: "link", text: "> EARN", action: { set: { credits: { add: 5 } } } },
                { type: "link", text: "> BARE", action: { screen: "bare" } },
            ],
        },
        bare: { header: false, footer: false, content: ["NO BARS HERE"] },
    },
    dialogs: { help: { type: "alert", content: "HELP" } },
};

const box = async (page: Page, selector: string) => {
    const found = await page.locator(selector).boundingBox();
    if (!found) throw new Error(`no ${selector}`);
    return found;
};

test.describe("bars", () => {
    test.use({ viewport: { width: 900, height: 500 } });

    test("are pinned to the top and bottom of the window", async ({ page, player }) => {
        await player.open(bars);
        const header = await box(page, ".bar-header");
        const footer = await box(page, ".bar-footer");
        expect(header.y).toBe(0);
        expect(footer.y + footer.height).toBeCloseTo(500, 0);
        await expect(page.locator(".bar-header")).toContainText("RELAY");
        await expect(page.locator(".bar-header")).toContainText("SECTOR 14");

        // the first line starts below the header
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        const first = await player.screen.locator(".text").first().boundingBox();
        expect(first?.y ?? 0).toBeGreaterThanOrEqual(header.height);

        // and they stay put when the page scrolls
        await page.evaluate(() => window.scrollTo(0, 400));
        expect((await box(page, ".bar-header")).y).toBe(0);
        expect((await box(page, ".bar-footer")).y).toBeCloseTo(footer.y, 0);
    });

    test("lay text out across their columns, and show variables as they change", async ({
        page,
        player,
    }) => {
        await player.open(bars);
        const footer = page.locator(".bar-footer");
        await expect(footer).toContainText("CREDITS: 0");
        await player.link("> EARN").click();
        await expect(footer).toContainText("CREDITS: 5");

        const line = await box(page, ".bar-footer .bar-line");
        const right = await footer.getByRole("button", { name: "[?] HELP" }).boundingBox();
        // the right slot ends at the right edge of the columns (inside the side padding)
        expect(line.x + line.width - ((right?.x ?? 0) + (right?.width ?? 0))).toBeLessThan(
            line.width / 10,
        );
    });

    test("can hold links, usable at any time", async ({ page, player }) => {
        await player.open(bars);
        await page.locator(".bar-footer").getByRole("button", { name: "[?] HELP" }).click();
        await expect(player.dialog).toContainText("HELP");
    });

    test("get the screen's bloom and fringe", async ({ page, player }) => {
        await player.open({
            ...bars,
            config: { ...bars.config, effects: { bloom: true, fringe: true } },
        });
        const line = page.locator(".bar-header .bar-line");
        await expect(line).toHaveCSS("filter", /teletronix-bloom/);
        await expect(line).toHaveCSS("text-shadow", /255, 40, 80/);
    });

    test("can be hidden by a screen", async ({ page, player }) => {
        await player.open(bars);
        await player.link("> BARE").click();
        await expect(player.screen).toContainText("NO BARS HERE");
        await expect(page.locator(".bar")).toHaveCount(0);
    });

    test.describe("with motion", () => {
        test.use({ reducedMotion: "no-preference" });

        test("keep the typing above the status bar", async ({ page, player }) => {
            await player.open(bars);
            await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
            const footer = await box(page, ".bar-footer");
            for (let i = 0; i < 3; i++) {
                const cursor = await page
                    .locator(".screen .reveal-cursor:not(:empty)")
                    .first()
                    .boundingBox()
                    .catch(() => null);
                if (cursor) expect(cursor.y + cursor.height).toBeLessThanOrEqual(footer.y + 1);
                await page.waitForTimeout(150);
            }
        });
    });
});

const crumbs: Program = {
    config: {
        name: "Crumbs",
        start: "home",
        header: [{ left: { breadcrumb: true }, right: "SHIP" }],
    },
    screens: {
        home: {
            content: [{ type: "link", text: "> READOUTS", action: { screen: "readouts" } }],
        },
        readouts: {
            title: "READOUTS & DIALS",
            parent: "home",
            content: [{ type: "link", text: "> SPINNERS", action: { screen: "spinners" } }],
        },
        spinners: { parent: "readouts", content: [{ type: "breadcrumb", separator: " / " }] },
    },
};

test.describe("breadcrumbs", () => {
    test("show where you are, in a bar or on a screen, and link back up", async ({
        page,
        player,
    }) => {
        await player.open(crumbs);
        const header = page.locator(".bar-header");
        await expect(header).toContainText("HOME");
        await player.link("> READOUTS").click();
        await player.link("> SPINNERS").click();
        await expect(header).toContainText("HOME › READOUTS & DIALS › SPINNERS");
        // the screen's own, with its separator: the last step isn't a link
        const trail = player.screen.getByRole("navigation", { name: "Breadcrumb" });
        await expect(trail).toHaveText("HOME / READOUTS & DIALS / SPINNERS");
        await expect(trail.getByRole("button")).toHaveText(["HOME", "READOUTS & DIALS"]);

        await header.getByRole("button", { name: "READOUTS & DIALS" }).click();
        await expect(player.link("> SPINNERS")).toBeVisible();
        await expect(header).not.toContainText("SPINNERS");
        await expect(header.getByRole("button")).toHaveText(["HOME"]);
    });
});

test.describe("pause", () => {
    const pauses: Program = {
        config: { name: "Pauses", start: "home" },
        screens: {
            home: {
                content: [
                    "PAGE ONE",
                    { type: "pause" },
                    "PAGE TWO",
                    { type: "pause", text: "[ MORE ]" },
                    "THE END",
                ],
            },
        },
    };

    test("stops the reveal until a key, then goes", async ({ page, player }) => {
        await player.open(pauses);
        const pause = player.screen.locator(".pause");
        await expect(pause).toContainText("-- PRESS ANY KEY TO CONTINUE --");
        await expect(player.screen).not.toContainText("PAGE TWO");

        await page.keyboard.press("Space");
        await expect(player.screen).toContainText("PAGE TWO");
        await expect(pause).toContainText("[ MORE ]");
        await expect(player.screen).not.toContainText("PRESS ANY KEY");
        await expect(player.screen).not.toContainText("THE END");
    });

    test("carries on at a tap", async ({ player }) => {
        await player.open(pauses);
        await player.tap();
        await expect(player.screen).toContainText("PAGE TWO");
        await player.tap();
        await expect(player.screen).toContainText("THE END");
        await expect(player.screen.locator(".pause")).toHaveCount(0);
    });
});
