import { expect, type Page, type Program, serveTestImages, test } from "./fixtures.ts";

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
async function openGm(page: Page, file: Program = program): Promise<Page> {
    const gm = await page.context().newPage();
    await gm.route("**/data/e2e.json", (route) => route.fulfill({ json: file }));
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
        await expect(gm.getByRole("tab", { name: "Media" })).toBeFocused();
        await expect(gm.getByRole("button", { name: "■ Stop all" })).toBeVisible();
        await expect(gm.getByRole("textbox", { name: "Message" })).toBeHidden();
        await gm.getByRole("tab", { name: "Media" }).press("ArrowLeft");
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

test.describe("the GM's soundboard", () => {
    test("plays the players a sound, and stops it all", async ({ page, player, audio }) => {
        const withSounds: Program = {
            ...program,
            sounds: { laser: { wave: "sine", decay: 0.4, frequency: 0.5, slide: -0.3 } },
        };
        await player.open(withSounds);
        // (sound starts at the player's first key or click)
        await player.tap();
        const gm = await openGm(page, withSounds);
        await expect(gm.getByRole("status")).toContainText("Players on HOME");
        await tab(gm, "Media");
        const board = gm.getByRole("region", { name: "Soundboard" });
        const played = await audio.during(
            () => board.getByRole("button", { name: "▶ laser" }).click(),
            400,
        );
        expect(played.recipes).toBe(1);
        const beeped = await audio.during(
            () => board.getByRole("button", { name: "▶ Alert" }).click(),
            400,
        );
        expect(beeped.oscillators).toBeGreaterThan(0);
        await gm.getByRole("button", { name: "■ Stop all" }).click();
    });
});

test.describe("the GM's pause", () => {
    test("stops the players under a cover, until the GM carries on", async ({ page, player }) => {
        await player.open(program);
        const gm = await openGm(page);
        await expect(gm.getByRole("status")).toContainText("Players on HOME");
        await tab(gm, "Messages");
        const standBy = gm.getByRole("region", { name: "Stand by" });
        await standBy.getByRole("textbox", { name: "On the cover" }).fill("BACK IN FIVE");
        await gm.getByRole("button", { name: "‖ Pause", exact: true }).click();

        const cover = page.getByRole("dialog", { name: "Paused" });
        await expect(cover).toContainText("BACK IN FIVE");
        // only the GM lifts it
        await page.keyboard.press("Escape");
        await expect(cover).toBeVisible();
        await expect(gm.getByRole("button", { name: "▶ Resume" }).first()).toBeVisible();

        // a new message shows at once
        await standBy.getByRole("textbox", { name: "On the cover" }).fill("BACK IN TEN");
        await expect(cover).toContainText("BACK IN TEN");

        await gm.getByRole("button", { name: "▶ Resume" }).first().click();
        await expect(cover).toHaveCount(0);
        await expect(player.screen).toContainText("HOME SCREEN");
    });
});

test.describe("the GM's handouts", () => {
    test("show the players an image over their screen, and close it", async ({ page, player }) => {
        await serveTestImages(page);
        const withPhoto: Program = {
            ...program,
            screens: {
                ...program.screens,
                bridge: {
                    ...program.screens.bridge,
                    content: [
                        "BRIDGE SCREEN",
                        {
                            type: "link",
                            text: "> PHOTO",
                            action: {
                                view: { src: "e2e-images/sunset-grid.png", caption: "A SUNSET" },
                            },
                        },
                    ],
                },
            },
        };
        await player.open(withPhoto);
        const gm = await openGm(page, withPhoto);
        await expect(gm.getByRole("status")).toContainText("Players on HOME");
        await tab(gm, "Media");
        const handouts = gm.getByRole("region", { name: "Handouts" });
        await handouts.getByRole("button", { name: /sunset-grid\.png/ }).click();
        await expect(page.getByRole("dialog", { name: "A SUNSET" })).toBeVisible();
        await expect(handouts.getByRole("button", { name: /sunset-grid\.png/ })).toHaveAttribute(
            "aria-current",
            "true",
        );
        await handouts.getByRole("button", { name: "Close it" }).click();
        await expect(page.getByRole("dialog", { name: "A SUNSET" })).toHaveCount(0);
    });
});

test.describe("the GM's ambience", () => {
    test("changes the sound in the background, or silences it", async ({ page, player }) => {
        const withAmbience: Program = {
            ...program,
            config: { ...program.config, ambience: "drone" },
            screens: { ...program.screens, engine: { ...program.screens.engine, ambience: false } },
            sounds: {
                drone: { src: "data/audio/sci-fi-drone.mp3" },
                engines: { src: "data/audio/sci-fi-drone.mp3", volume: 0.4 },
            },
        };
        await player.open(withAmbience);
        const gm = await openGm(page, withAmbience);
        await tab(gm, "Media");
        const panel = gm.getByText(/The sound looping in the background/);
        await expect(panel).toContainText("drone now");

        await gm.getByRole("combobox", { name: "Ambience" }).click();
        await gm.getByRole("option", { name: "engines" }).click();
        await expect(panel).toContainText("engines now");
        await gm.getByRole("combobox", { name: "Ambience" }).click();
        await gm.getByRole("option", { name: "Silence" }).click();
        await expect(panel).toContainText("none now");

        await gm.keyboard.press("ControlOrMeta+k");
        await gm.getByRole("textbox", { name: "Command" }).fill("ambience as the program");
        await gm.keyboard.press("Enter");
        await expect(panel).toContainText("drone now");
        // a screen without stays without
        await gm.keyboard.press("ControlOrMeta+k");
        await gm.getByRole("textbox", { name: "Command" }).fill("engine room");
        await gm.keyboard.press("Enter");
        await expect(panel).toContainText("none now");
    });
});

test.describe("the GM's command palette", () => {
    test("does what the panel does, by name, from the keyboard", async ({ page, player }) => {
        await player.open(program);
        const gm = await openGm(page);
        await expect(gm.getByRole("status")).toContainText("Players on HOME");
        const command = async (words: string) => {
            await gm.keyboard.press("ControlOrMeta+k");
            await gm.getByRole("textbox", { name: "Command" }).fill(words);
            await gm.keyboard.press("Enter");
        };

        await command("engine");
        await expect(player.screen).toContainText("ENGINE SCREEN");
        await command("open warning");
        await expect(player.dialog).toContainText("WARNING DIALOG");
        await command("close the open");
        await expect(player.dialog).toHaveCount(0);

        // true/false at once; anything else in its field
        await command("alarm");
        await tab(gm, "Variables");
        await expect(gm.getByRole("switch", { name: "alarm" })).toBeChecked();
        await tab(gm, "Screens");
        await command("credits");
        await expect(gm.getByRole("textbox", { name: "credits" })).toBeFocused();
        await gm.keyboard.type("7");
        await gm.keyboard.press("Enter");
        await command("home");
        await expect(player.screen).toContainText("CREDITS: 7");

        await gm.getByRole("button", { name: "Commands" }).click();
        await gm.getByRole("textbox", { name: "Command" }).fill("start clock");
        await gm.keyboard.press("Enter");
        await expect(gm.locator(".gm-timer")).toContainText("▶");
    });
});

/** Starts the panel's session, and reads its code. */
async function startSession(gm: Page): Promise<string> {
    await gm.getByRole("button", { name: "Start a session" }).click();
    await expect(gm.locator(".gm-pairing")).toContainText("Connected");
    return (await gm.locator(".gm-pairing strong").innerText()).trim();
}

test.describe("over the network", () => {
    test("a player joins the GM's session by its code, and the GM controls it", async ({
        page,
        player,
        browser,
    }) => {
        // the GM, on another device: a browser context of its own, which shares no channel
        const device = await browser.newContext();
        const gm = await device.newPage();
        await gm.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        await gm.goto("./?data=e2e&gm");
        await expect(gm.getByRole("status")).toContainText("No players' window");
        const code = await startSession(gm);
        expect(code).toMatch(/^[BCDFGHJKMNPQRSTVWXYZ]{4}-\d{4}$/);

        // the players' device asks for it, and takes it however it's typed
        await player.open(program, "&join");
        const prompt = page.getByRole("dialog", { name: "JOIN A GM'S SESSION" });
        await prompt.getByRole("textbox", { name: "Session code" }).fill(code.toLowerCase());
        await prompt.getByRole("button", { name: "> JOIN" }).click();
        await expect(prompt).toHaveCount(0);
        const badge = page.locator(".remote-badge");
        await expect(badge).toContainText(`SESSION ${code} · GM CONNECTED`);
        await expect(gm.getByRole("status").first()).toContainText("Players on HOME");
        await expect(gm.locator(".gm-pairing")).toContainText("1 device");

        await gm.getByRole("button", { name: /^BRIDGE/ }).click();
        await expect(player.screen).toContainText("BRIDGE SCREEN");
        await tab(gm, "Messages");
        await gm.getByRole("textbox", { name: "Message" }).fill("FROM ACROSS THE ROOM");
        await gm.getByRole("button", { name: "Send" }).click();
        await expect(player.dialog).toContainText("FROM ACROSS THE ROOM");
        await page.keyboard.press("Enter");

        // both stay in the session after a reload
        await gm.reload();
        await expect(gm.locator(".gm-pairing")).toContainText(`Session ${code}`);
        await expect(gm.getByRole("status").first()).toContainText("Players on BRIDGE");
        await page.reload();
        await expect(badge).toContainText(`SESSION ${code} · GM CONNECTED`);
        // (the players' window started over; the panel kept its tab: back to its screens)
        await expect(player.screen).toContainText("HOME SCREEN");
        await tab(gm, "Screens");
        await gm.getByRole("button", { name: /^BRIDGE/ }).click();
        await expect(player.screen).toContainText("BRIDGE SCREEN");
        await device.close();
    });

    test("lets the GM take a device out of the session", async ({ page, player, browser }) => {
        const device = await browser.newContext();
        const gm = await device.newPage();
        await gm.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        await gm.goto("./?data=e2e&gm");
        const code = await startSession(gm);
        await player.open(program, `&join=${code}`);
        await expect(page.locator(".remote-badge")).toContainText("GM CONNECTED");

        await tab(gm, "Devices");
        const joined = gm.getByRole("region", { name: "Joined devices" });
        await expect(joined).toContainText("Device 1 · on HOME");
        await joined.getByRole("button", { name: "Remove device 1" }).click();
        await expect(joined).toContainText("None yet.");
        const prompt = page.getByRole("dialog", { name: "JOIN A GM'S SESSION" });
        await expect(prompt).toContainText("THE GM TOOK THIS DEVICE OUT OF THE SESSION.");
        // (playing on, without one)
        await prompt.getByRole("button", { name: "> PLAY WITHOUT ONE" }).click();
        await expect(prompt).toHaveCount(0);
        await expect(player.screen).toContainText("HOME SCREEN");
        await device.close();
    });

    test("won't let another GM with the same code take the session", async ({ browser }) => {
        const first = await (await browser.newContext()).newPage();
        await first.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        await first.goto("./?data=e2e&gm");
        const code = await startSession(first);

        // (as if someone knew the code, but not the secret)
        const impostor = await (await browser.newContext()).newPage();
        await impostor.addInitScript((code) => {
            localStorage.setItem(
                "teletronix:gm-session:e2e",
                JSON.stringify({ code, secret: "zzzzzzzzzzzzzzzzzzzzzzzzzzzz" }),
            );
        }, code);
        await impostor.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        await impostor.goto("./?data=e2e&gm");
        await expect(impostor.locator(".gm-pairing")).toContainText("Another GM has this code");
        await first.context().close();
        await impostor.context().close();
    });

    test("asks for a code that's one: four letters, then four digits", async ({ page, player }) => {
        await player.open(program, "&join");
        const prompt = page.getByRole("dialog", { name: "JOIN A GM'S SESSION" });
        const field = prompt.getByRole("textbox", { name: "Session code" });
        const join = prompt.getByRole("button", { name: "> JOIN" });
        // (it puts in the dash, and capitals)
        await field.fill("bcdf12");
        await expect(field).toHaveValue("BCDF-12");
        await expect(join).toBeDisabled();
        // (an O among the digits is a 0)
        await field.fill("bcdf120o");
        await expect(join).toBeEnabled();
        await field.fill("abcd1234");
        await expect(join).toBeDisabled();
        // Esc plays on without one
        await page.keyboard.press("Escape");
        await expect(prompt).toHaveCount(0);
        await expect(player.screen).toContainText("HOME SCREEN");
    });

    test("does each command once, from the same browser and the network both", async ({
        page,
        player,
    }) => {
        const gm = await openGm(page);
        const code = await startSession(gm);
        await player.open(program, `&join=${code}`);
        await expect(page.locator(".remote-badge")).toContainText("GM CONNECTED");

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

    test("keeps to itself without &join", async ({ page, player }) => {
        await player.open(program);
        await page.waitForTimeout(300);
        await expect(page.locator(".remote-badge")).toHaveCount(0);
        await expect(page.getByRole("dialog", { name: "JOIN A GM'S SESSION" })).toHaveCount(0);
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

    test("opens the program on the device, in the panel's session", async ({ page, browser }) => {
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
        expect(address).toBe(`http://192.168.0.20:4173/?data=e2e&join=${code}`);
        await page.getByRole("checkbox", { name: /kiosk/ }).check();
        await expect(page.locator(".gm-address")).toHaveText(`${address}&kiosk`);

        // the device opens it (here, at the test server's own address)
        const device = await (await browser.newContext()).newPage();
        await device.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
        const { search } = new URL(address);
        await device.goto(`./${search}`);
        await expect(device.locator(".remote-badge")).toContainText(
            `SESSION ${code} · GM CONNECTED`,
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
        const gm = await openGm(page);
        gm.on("pageerror", (error) => errors.push(error.message));
        const code = await startSession(gm);
        // (the old name for &join still works)
        await page.goto(`./?data=e2e&remote=${code}&kiosk`);
        expect(await page.evaluate(() => "randomUUID" in crypto)).toBe(false);
        // (kiosk mode starts, and asks for the wake lock, at a key press)
        await page.getByText("PRESS ANY KEY").waitFor();
        await page.keyboard.press("Space");
        await expect(player.screen).toContainText("HOME SCREEN");
        const badge = page.locator(".remote-badge");
        await expect(badge).toContainText(`SESSION ${code} · GM CONNECTED`);
        await gm.getByRole("button", { name: /^BRIDGE/ }).click();
        await expect(player.screen).toContainText("BRIDGE SCREEN");
        expect(errors).toEqual([]);
    });
});
