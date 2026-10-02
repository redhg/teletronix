import { expect, type Page, type Program, test } from "./fixtures.ts";

const program: Program = {
    config: {
        name: "Remote",
        start: "home",
        reveal: "instant",
        variables: { credits: 0, alarm: false },
        timers: { clock: { from: 90 } },
    },
    screens: {
        home: { title: "HOME", content: ["HOME SCREEN", "CREDITS: {credits}"] },
        bridge: { title: "BRIDGE", parent: "home", content: ["BRIDGE SCREEN"] },
        engine: { title: "ENGINE ROOM", parent: "bridge", content: ["ENGINE SCREEN"] },
    },
    dialogs: { warning: { type: "alert", content: "WARNING DIALOG" } },
};

/** Opens one of the panel's tabs. */
const tab = (gm: Page, name: string) => gm.getByRole("tab", { name }).click();

/** A GM's panel for the test program, in another window of the same browser. */
async function openGm(page: Page): Promise<Page> {
    const gm = await page.context().newPage();
    await gm.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
    await gm.goto("./?data=e2e&gm");
    return gm;
}

test.describe("a GM's panel", () => {
    test("sees the players' screen, and sends them to another", async ({ page, player }) => {
        await player.open(program);
        const gm = await openGm(page);
        await expect(gm.getByRole("status")).toContainText("Players on HOME");

        await gm.getByRole("button", { name: /^BRIDGE/ }).click();
        await expect(player.screen).toContainText("BRIDGE SCREEN");
        await expect(gm.getByRole("status")).toContainText("Players on BRIDGE");
        await gm.getByRole("button", { name: "← Back" }).click();
        await expect(player.screen).toContainText("HOME SCREEN");
    });

    test("puts its controls in tabs, kept as they are while away", async ({ page, player }) => {
        await player.open(program);
        const gm = await openGm(page);
        await expect(gm.getByRole("tab", { name: "Screens" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
        await tab(gm, "Messages");
        await gm.getByRole("textbox", { name: "Message" }).fill("HALF A MESSAGE");
        // <right> and <left> move between them
        await gm.getByRole("tab", { name: "Messages" }).press("ArrowRight");
        await expect(gm.getByRole("tab", { name: "Variables" })).toBeFocused();
        await expect(gm.getByRole("textbox", { name: "credits" })).toBeVisible();
        await expect(gm.getByRole("textbox", { name: "Message" })).toBeHidden();
        await gm.getByRole("tab", { name: "Variables" }).press("ArrowLeft");
        await expect(gm.getByRole("textbox", { name: "Message" })).toHaveValue("HALF A MESSAGE");

        // and the panel opens at the last one
        await gm.reload();
        await expect(gm.getByRole("tab", { name: "Messages" })).toHaveAttribute(
            "aria-selected",
            "true",
        );
    });

    test("is light, dark, or as the system says, and remembers which", async ({ page }) => {
        await page.emulateMedia({ colorScheme: "dark" });
        await page.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        await page.goto("./?data=e2e&gm");
        const scheme = () => page.locator("html").getAttribute("data-mantine-color-scheme");
        // (as the system says, to begin with)
        await expect.poll(scheme).toBe("dark");
        const choose = (name: string) =>
            page.getByRole("radiogroup", { name: "Colour scheme" }).getByText(name).click();
        await choose("Light");
        await expect.poll(scheme).toBe("light");
        await page.reload();
        await expect.poll(scheme).toBe("light");
        await choose("Auto");
        await expect.poll(scheme).toBe("dark");
    });

    test("says when no players' window is open", async ({ page }) => {
        await page.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        await page.goto("./?data=e2e&gm");
        await expect(page.getByRole("status")).toContainText("No players' window is open");
    });

    test("changes variables, and sees them change", async ({ page, player }) => {
        await player.open(program);
        const gm = await openGm(page);
        await tab(gm, "Variables");
        const credits = gm.getByRole("textbox", { name: "credits" });
        await credits.fill("250");
        await credits.press("Enter");
        await gm.getByRole("switch", { name: "alarm" }).click();
        await expect(gm.getByRole("switch", { name: "alarm" })).toBeChecked();
        await expect(player.screen).toContainText("CREDITS: 250");
    });

    test("opens and closes dialogs, and transmits messages", async ({ page, player }) => {
        await player.open(program);
        const gm = await openGm(page);
        await tab(gm, "Messages");
        await gm.getByRole("button", { name: "warning" }).click();
        await expect(player.dialog).toContainText("WARNING DIALOG");
        await gm.getByRole("button", { name: "Close the open dialog" }).click();
        await expect(player.dialog).toHaveCount(0);

        await gm.getByRole("textbox", { name: "Message" }).fill("MOTHER: CREW EXPENDABLE.");
        await gm.getByRole("textbox", { name: "Button" }).fill("ACKNOWLEDGE");
        await gm.getByRole("checkbox", { name: "Alert colour" }).check();
        await gm.getByRole("button", { name: "Send" }).click();
        await expect(player.dialog).toContainText("MOTHER: CREW EXPENDABLE.");
        await expect(player.dialog).toContainText("ACKNOWLEDGE");
        await expect(gm.getByRole("status")).toContainText("@transmission");
    });

    test("runs timers and turns effects on", async ({ page, player }) => {
        await player.open(program);
        const gm = await openGm(page);
        await tab(gm, "Variables");
        await gm.getByRole("button", { name: "Start", exact: true }).click();
        await expect(gm.locator(".gm-timer")).toContainText("▶");
        await gm.getByRole("button", { name: "Stop", exact: true }).click();
        await expect(gm.locator(".gm-timer")).toContainText("■");

        await tab(gm, "Effects");
        await gm
            .getByRole("radiogroup", { name: "static" })
            .getByText("On", { exact: true })
            .click();
        await expect(page.locator("canvas.static")).toBeAttached();
        await gm
            .getByRole("radiogroup", { name: "static" })
            .getByText("As the program says")
            .click();
        await expect(page.locator("canvas.static")).toHaveCount(0);
    });
});

test.describe("over the network", () => {
    test("pairs a panel with a terminal by its code, and controls it", async ({
        page,
        player,
        browser,
    }) => {
        await player.open(program, "&remote");
        const badge = page.locator(".remote-badge");
        await expect(badge).toContainText("WAITING FOR GM");
        const code = (await badge.innerText()).match(/REMOTE (\w+)/)?.[1] ?? "";

        // another device: a browser context of its own, which shares no channel with the first
        const device = await browser.newContext();
        const gm = await device.newPage();
        await gm.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        await gm.goto("./?data=e2e&gm");
        await expect(gm.getByRole("status")).toContainText("No players' window");
        await gm.getByRole("textbox", { name: "Another device's code" }).fill(code.toLowerCase());
        await gm.getByRole("button", { name: "Pair" }).click();

        await expect(gm.locator(".gm-pairing")).toContainText(`Paired with ${code}`);
        await expect(gm.locator(".gm-pairing")).toContainText("Connected");
        await expect(gm.getByRole("status").first()).toContainText("Players on HOME");
        await expect(badge).toContainText("GM CONNECTED");

        await gm.getByRole("button", { name: /^BRIDGE/ }).click();
        await expect(player.screen).toContainText("BRIDGE SCREEN");
        await tab(gm, "Messages");
        await gm.getByRole("textbox", { name: "Message" }).fill("FROM ACROSS THE ROOM");
        await gm.getByRole("button", { name: "Send" }).click();
        await expect(player.dialog).toContainText("FROM ACROSS THE ROOM");

        // it stays paired after a reload
        await gm.reload();
        await expect(gm.locator(".gm-pairing")).toContainText(`Paired with ${code}`);
        await expect(gm.getByRole("status").first()).toContainText("Players on BRIDGE");
        await device.close();
    });

    test("does each command once, from the same browser and the network both", async ({
        page,
        player,
    }) => {
        await player.open(program, "&remote");
        const badge = page.locator(".remote-badge");
        await expect(badge).toContainText("WAITING FOR GM");
        const code = (await badge.innerText()).match(/REMOTE (\w+)/)?.[1] ?? "";
        const gm = await openGm(page);
        await gm.getByRole("textbox", { name: "Another device's code" }).fill(code);
        await gm.getByRole("button", { name: "Pair" }).click();
        await expect(gm.locator(".gm-pairing")).toContainText("Connected");

        await gm.getByRole("button", { name: /^BRIDGE/ }).click();
        await expect(player.screen).toContainText("BRIDGE SCREEN");
        await gm.getByRole("button", { name: /^ENGINE ROOM/ }).click();
        await expect(player.screen).toContainText("ENGINE SCREEN");
        // going back once goes to the BRIDGE, not on past it to HOME
        await gm.getByRole("button", { name: "← Back" }).click();
        await expect(player.screen).toContainText("BRIDGE SCREEN");
        await page.waitForTimeout(500);
        await expect(player.screen).toContainText("BRIDGE SCREEN");
    });

    test("keeps its code to itself without &remote", async ({ page, player }) => {
        await player.open(program);
        await page.waitForTimeout(300);
        await expect(page.locator(".remote-badge")).toHaveCount(0);
    });
});

test.describe("a QR code for the players' device", () => {
    test("explains how, when other devices can't reach Teletronix", async ({ page }) => {
        await page.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        await page.goto("./?data=e2e&gm");
        await tab(page, "Devices");
        await expect(page.getByRole("region", { name: "Players' device" })).toContainText(
            "npm run table",
        );
    });

    test("opens the program on the device, paired with the panel", async ({ page, browser }) => {
        await page.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        // (as if served to the network, at this address)
        await page.route("**/remote/addresses", (route) =>
            route.fulfill({ json: ["http://192.168.0.20:4173/"] }),
        );
        await page.goto("./?data=e2e&gm");
        await tab(page, "Devices");
        await page.getByRole("button", { name: "Show a QR code" }).click();
        await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
        const address = await page.locator(".gm-address").innerText();
        const code = (await page.locator(".gm-pairing strong").innerText()).trim();
        expect(address).toBe(`http://192.168.0.20:4173/?data=e2e&remote=${code}`);
        await page.getByRole("checkbox", { name: /kiosk/ }).check();
        await expect(page.locator(".gm-address")).toHaveText(`${address}&kiosk`);

        // the device opens it (here, at the test server's own address)
        const device = await (await browser.newContext()).newPage();
        await device.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        const { search } = new URL(address);
        await device.goto(`./${search}`);
        await expect(device.locator(".remote-badge")).toContainText(
            `REMOTE ${code} · GM CONNECTED`,
        );
        await expect(page.getByRole("status").first()).toContainText("Players on HOME");
        await device.context().close();
    });
});

test.describe("served to the network over plain http", () => {
    test("works without the features browsers keep for secure pages", async ({ page, player }) => {
        // (localhost counts as secure; an address like http://192.168.2.139 doesn't, and
        // browsers leave these out there)
        await page.context().addInitScript(() => {
            const prototype = (object: object) => Object.getPrototypeOf(object) as object;
            Reflect.deleteProperty(prototype(crypto), "randomUUID");
            for (const name of ["clipboard", "wakeLock", "serviceWorker"]) {
                Reflect.deleteProperty(prototype(navigator), name);
            }
        });
        const errors: string[] = [];
        await page.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        await page.goto("./?data=e2e&remote&kiosk");
        expect(await page.evaluate(() => "randomUUID" in crypto)).toBe(false);
        // (kiosk mode starts, and asks for the wake lock, at a key press)
        await page.getByText("PRESS ANY KEY").waitFor();
        await page.keyboard.press("Space");
        await expect(player.screen).toContainText("HOME SCREEN");
        const badge = page.locator(".remote-badge");
        await expect(badge).toContainText("WAITING FOR GM");
        const code = (await badge.innerText()).match(/REMOTE (\w+)/)?.[1] ?? "";

        const gm = await openGm(page);
        gm.on("pageerror", (error) => errors.push(error.message));
        await gm.getByRole("textbox", { name: "Another device's code" }).fill(code);
        await gm.getByRole("button", { name: "Pair" }).click();
        await expect(badge).toContainText("GM CONNECTED");
        await gm.getByRole("button", { name: /^BRIDGE/ }).click();
        await expect(player.screen).toContainText("BRIDGE SCREEN");
        expect(errors).toEqual([]);
    });
});
