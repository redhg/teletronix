import { expect, type Program, test } from "./fixtures.ts";

const link = (text: string, screen: string, sound?: string) => ({
    type: "link" as const,
    text,
    action: sound ? { screen, sound } : { screen },
});

const program: Program = {
    config: { name: "Sound", start: "home" },
    screens: {
        home: {
            content: [
                "HOME",
                link("> BEEP", "home"),
                link("> LASER", "home", "laser"),
                { type: "link", text: "> DOOR", action: { dialog: "door", sound: "laser" } },
                link("> SOUNDS", "sounds"),
                link("> STATIC", "static"),
            ],
        },
        sounds: {
            sound: "laser",
            content: [{ type: "text", text: "A LINE WITH A SOUND", sound: "laser" }],
        },
        static: { effects: { static: true }, content: ["STATIC"] },
    },
    dialogs: { door: { type: "alert", content: "THE DOOR OPENS", sound: "laser" } },
    sounds: { laser: { wave: "sine", decay: 0.1, frequency: 0.5, slide: -0.3 } },
};

test("stays silent until the player interacts", async ({ page, player, audio }) => {
    await player.open(program);
    await page.waitForTimeout(300);
    expect((await audio.counts()).contexts).toBe(0);
    await page.keyboard.press("Shift");
    await expect.poll(async () => (await audio.counts()).state).toBe("running");
});

test("beeps when a link is followed", async ({ player, audio }) => {
    await player.open(program);
    await player.tap();
    const played = await audio.during(() => player.link("> BEEP").click());
    expect(played.oscillators).toBeGreaterThan(0);
});

test.describe("a program's own sounds", () => {
    // (asking for `audio` installs its spy before the page loads)
    test.beforeEach(async ({ player, audio: _ }) => {
        await player.open(program);
        await player.tap();
    });

    test("play for a link", async ({ player, audio }) => {
        const played = await audio.during(() => player.link("> LASER").click());
        expect(played.recipes).toBeGreaterThanOrEqual(1);
    });

    test("play for a screen and an element", async ({ player, audio }) => {
        const played = await audio.during(() => player.link("> SOUNDS").click(), 400);
        // the screen's sound and its line's (the select beep is built in)
        expect(played.recipes).toBe(2);
    });

    test("play for a dialog", async ({ player, audio }) => {
        const played = await audio.during(() => player.link("> DOOR").click());
        await expect(player.dialog).toContainText("THE DOOR OPENS");
        // the action's sound and the dialog's
        expect(played.recipes).toBe(2);
    });

    test('can replace a built-in sound, e.g. "select"', async ({ page, player, audio }) => {
        await page.route("**/data/e2e.json", (route) =>
            route.fulfill({
                json: { ...program, sounds: { ...program.sounds, select: { wave: "square" } } },
            }),
        );
        await player.open("e2e");
        await player.tap();
        const played = await audio.during(() => player.link("> BEEP").click());
        expect(played).toMatchObject({ oscillators: 0, recipes: 1 });
    });
});

test("hisses under static", async ({ player, audio }) => {
    await player.open(program);
    await player.tap();
    const played = await audio.during(() => player.link("> STATIC").click(), 300);
    expect(played.loops).toBeGreaterThan(0);
});

test("can be muted, and stays muted", async ({ page, player, audio }) => {
    await player.open(program);
    await player.tap();
    const toggle = page.locator(".sound-toggle");
    await expect(toggle).toHaveText("[SOUND ON]");
    await toggle.click();
    await expect(toggle).toHaveText("[SOUND OFF]");
    const played = await audio.during(() => player.link("> LASER").click(), 300);
    expect(played).toEqual({ oscillators: 0, noise: 0, loops: 0, recipes: 0 });

    await page.reload();
    await expect(page.locator(".sound-toggle")).toHaveText("[SOUND OFF]");
});

test("mutes and unmutes with Ctrl+M", async ({ page, player }) => {
    await player.open(program);
    const toggle = page.locator(".sound-toggle");
    await page.keyboard.press("Control+m");
    await expect(toggle).toHaveText("[SOUND OFF]");
    await page.keyboard.press("Control+m");
    await expect(toggle).toHaveText("[SOUND ON]");
});

test("can be turned off by the program", async ({ page, player }) => {
    await player.open({ ...program, config: { ...program.config, sound: false } });
    await expect(page.locator(".sound-toggle")).toHaveCount(0);
});

test.describe("with motion", () => {
    test.use({ reducedMotion: "no-preference" });

    test("clicks as text types in", async ({ page, player, audio }) => {
        await player.open({
            config: { name: "Typing", start: "home" },
            screens: { home: { content: ["x".repeat(300)] } },
        });
        await page.keyboard.press("Shift");
        await expect.poll(async () => (await audio.counts()).noise).toBeGreaterThan(5);
    });

    test("crackles through a glitch", async ({ player, audio }) => {
        await player.open({
            ...program,
            screens: {
                ...program.screens,
                home: { reveal: "instant", content: [link("> GLITCH", "glitch")] },
                glitch: { reveal: "glitch", transition: "glitch", content: ["GLITCH"] },
            },
        });
        await player.tap();
        const played = await audio.during(() => player.link("> GLITCH").click(), 500);
        expect(played.oscillators + played.noise).toBeGreaterThan(2);
    });
});
