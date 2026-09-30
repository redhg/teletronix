import { expect, type Page, type Player, type Program, serveTestImages, test } from "./fixtures.ts";

// (some tests use a test image, served from e2e/fixtures)
test.beforeEach(async ({ page }) => {
    await serveTestImages(page);
});

const back = { type: "link" as const, text: "> BACK", action: { screen: "home" } };
const IMAGE = "e2e-images/sunset-grid.png";

const program: Program = {
    config: { name: "Modules", start: "home" },
    screens: {
        home: {
            content: [
                "HOME",
                { type: "link", text: "> TOGGLES", action: { screen: "toggles" } },
                { type: "link", text: "> PROMPT", action: { screen: "prompt" } },
                { type: "link", text: "> SLIDERS", action: { screen: "sliders" } },
            ],
        },
        toggles: {
            content: [
                { type: "toggle", states: ["[ ] ONE", "[X] ONE"] },
                { type: "toggle", states: ["ALPHA", "BETA", "GAMMA"], initial: 2 },
                back,
            ],
        },
        prompt: {
            content: [
                {
                    type: "prompt",
                    prompt: "> ",
                    unknown: "UNKNOWN COMMAND",
                    commands: [
                        { command: ["home", "go home"], action: { screen: "home" } },
                        { command: "help", action: { dialog: "help" } },
                    ],
                },
            ],
        },
        sliders: {
            content: [
                {
                    type: "slider",
                    label: "TUNER ",
                    min: 0,
                    max: 10,
                    step: 1,
                    value: 5,
                    unit: " MHz",
                    on: [{ equals: 7, action: { screen: "tuned" } }],
                },
                {
                    type: "slider",
                    label: "POWER ",
                    step: 10,
                    value: 50,
                    unit: "%",
                    on: [
                        { atLeast: 70, className: "alert" },
                        { atLeast: 90, action: { dialog: "hot" } },
                    ],
                    onEnter: { dialog: "set" },
                },
                back,
            ],
        },
        tuned: { content: ["TUNED IN", back] },
    },
    dialogs: {
        help: { type: "alert", content: "HELP TEXT" },
        hot: { type: "alert", content: "TOO HOT" },
        set: { type: "alert", content: "POWER SET" },
    },
};

test.describe("toggle", () => {
    test("cycles through its states, and remembers them", async ({ player }) => {
        await player.open(program);
        await player.link("> TOGGLES").click();
        const [one, abc] = [
            player.screen.locator(".toggle").nth(0),
            player.screen.locator(".toggle").nth(1),
        ];
        await expect(one).toContainText("[ ] ONE");
        await expect(abc).toContainText("GAMMA");
        await one.click();
        await expect(one).toContainText("[X] ONE");
        await abc.click();
        await expect(abc).toContainText("ALPHA");

        await player.link("> BACK").click();
        await player.link("> TOGGLES").click();
        await expect(one).toContainText("[X] ONE");
        await expect(abc).toContainText("ALPHA");
    });
});

test.describe("prompt", () => {
    test.beforeEach(async ({ player }) => {
        await player.open(program);
        await player.link("> PROMPT").click();
    });

    test("takes the keyboard, and keeps it", async ({ page, player }) => {
        const input = player.screen.locator(".prompt input");
        await expect(input).toBeFocused();
        await player.tap();
        await expect(input).toBeFocused();
        await page.keyboard.type("hello");
        await expect(input).toHaveValue("hello");
        await expect(player.screen.locator(".prompt-echo")).toContainText("hello");
    });

    test("runs commands, ignoring case and extra spaces", async ({ page, player }) => {
        await page.keyboard.type("  Go   HOME ");
        await page.keyboard.press("Enter");
        await expect(player.screen).toContainText("HOME");
    });

    test("explains an unknown command", async ({ page, player }) => {
        await page.keyboard.type("warp");
        await page.keyboard.press("Enter");
        await expect(player.screen.locator(".prompt-message")).toHaveText("UNKNOWN COMMAND");
        await expect(player.screen.locator(".prompt input")).toHaveValue("");
    });

    test("waits while a dialog is open", async ({ page, player }) => {
        const input = player.screen.locator(".prompt input");
        await page.keyboard.type("help");
        await page.keyboard.press("Enter");
        await expect(player.dialog).toContainText("HELP TEXT");
        await expect(input).toBeDisabled();
        await page.keyboard.press("Enter");
        await expect(player.dialog).toHaveCount(0);
        await expect(input).toBeFocused();
    });
});

test.describe("slider", () => {
    test.beforeEach(async ({ player }) => {
        await player.open(program);
        await player.link("> SLIDERS").click();
    });

    const slider = (player: Player, label: string) =>
        player.screen.getByRole("slider", { name: label });

    test("moves with the keys, and redraws", async ({ page, player }) => {
        const power = slider(player, "POWER");
        await power.focus();
        await page.keyboard.press("ArrowRight");
        await expect(power).toHaveAttribute("aria-valuenow", "60");
        await expect(power).toContainText("60%");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await expect(power).toHaveAttribute("aria-valuenow", "40");
        await page.keyboard.press("Home");
        await expect(power).toHaveAttribute("aria-valuetext", "0%");
    });

    test("follows a drag", async ({ page, player }) => {
        const tuner = slider(player, "TUNER");
        const box = await tuner.boundingBox();
        if (!box) throw new Error("no slider");
        const y = box.y + box.height / 2;
        await page.mouse.move(box.x + box.width - 2, y);
        await page.mouse.down();
        // (past the end of the bar is its maximum)
        await expect(tuner).toHaveAttribute("aria-valuenow", "10");
        const bar = await tuner.evaluate((element) => {
            const range = document.createRange();
            range.selectNodeContents(element.querySelector('[aria-hidden="true"]') as Node);
            const { left, width } = range.getBoundingClientRect();
            return { left, width };
        });
        await page.mouse.move(bar.left, y, { steps: 4 });
        await page.mouse.up();
        await expect(tuner).toHaveAttribute("aria-valuenow", "0");
    });

    test("remembers its value", async ({ page, player }) => {
        await slider(player, "TUNER").focus();
        await page.keyboard.press("ArrowLeft");
        await player.link("> BACK").click();
        await player.link("> SLIDERS").click();
        await expect(slider(player, "TUNER")).toHaveAttribute("aria-valuenow", "4");
    });

    test("acts when its value enters a range", async ({ page, player }) => {
        await slider(player, "POWER").focus();
        await page.keyboard.press("End");
        await expect(player.dialog).toContainText("TOO HOT");
        await page.keyboard.press("Enter");

        await slider(player, "TUNER").focus();
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await expect(player.screen).toContainText("TUNED IN");
    });

    test("turns red while its value is in a range", async ({ page, player }) => {
        const power = slider(player, "POWER");
        await power.focus();
        await expect(power).not.toHaveClass(/\balert\b/);
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await expect(power).toHaveClass(/\balert\b/);
        await expect(power).toHaveCSS("color", "rgb(255, 60, 0)");
        await page.keyboard.press("ArrowLeft");
        await expect(power).not.toHaveClass(/\balert\b/);
        // still focused, so the keys still work
        await expect(power).toBeFocused();
    });

    test("acts on Enter", async ({ page, player }) => {
        await slider(player, "POWER").focus();
        await page.keyboard.press("Enter");
        await expect(player.dialog).toContainText("POWER SET");
    });
});

test.describe("bitmap", () => {
    /** The color at the middle of the sun, in each image on the screen. */
    const suns = (page: Page) =>
        page.$$eval(".bitmap canvas", (canvases) =>
            (canvases as HTMLCanvasElement[]).map((canvas) => {
                const context = canvas.getContext("2d");
                const x = Math.floor(canvas.width / 2);
                const y = Math.floor(canvas.height * 0.36);
                return [...(context?.getImageData(x, y, 1, 1).data ?? [])].slice(0, 3);
            }),
        );
    const saturation = ([r = 0, g = 0, b = 0]: number[]) => {
        const max = Math.max(r, g, b);
        return max ? (max - Math.min(r, g, b)) / max : 0;
    };

    const images = (theme: "green" | "amber" = "green"): Program => ({
        config: { name: "Images", start: "home", theme },
        screens: {
            home: {
                content: [
                    { type: "bitmap", src: IMAGE, alt: "PLAIN" },
                    { type: "bitmap", src: IMAGE, alt: "MONO", blend: "luminosity" },
                    {
                        type: "bitmap",
                        src: IMAGE,
                        alt: "TEXT COLOR",
                        blend: { mode: "luminosity", with: "text" },
                    },
                    "END",
                ],
            },
        },
    });

    test.use({ viewport: { width: 1000, height: 2400 } });

    test("draws the image, labelled with its alt text", async ({ player }) => {
        await player.open(images());
        await expect(player.screen).toContainText("END");
        await expect(player.screen.getByRole("img", { name: "PLAIN" })).toBeVisible();
        await expect(player.screen.locator(".bitmap canvas")).toHaveCount(3);
    });

    test("blends with the theme's colors", async ({ page, player }) => {
        await player.open(images());
        await expect(player.screen).toContainText("END");
        const [plain, mono, text] = await suns(page);
        // the sun is a saturated color; a luminosity blend over black keeps it bright but grey
        expect(saturation(plain ?? [])).toBeGreaterThan(0.5);
        expect(saturation(mono ?? [])).toBeLessThan(0.2);
        // blended with the text color, it's green
        const [r = 0, g = 0, b = 0] = text ?? [];
        expect(g).toBeGreaterThan(r);
        expect(g).toBeGreaterThan(b);
    });

    test("with bloom on, still blends", async ({ page, player }) => {
        const program = images("amber");
        program.config.effects = { bloom: true };
        await player.open(program);
        await expect(player.screen).toContainText("END");
        await expect(page.locator("html")).toHaveAttribute("data-bloom");
        const [, mono, text] = await suns(page);
        expect(saturation(mono ?? [])).toBeLessThan(0.2);
        // amber: more red than blue
        const [r = 0, , b = 0] = text ?? [];
        expect(r).toBeGreaterThan(b);
    });

    test.describe("that can't load", () => {
        test.use({ expectedErrors: [/404|Failed to load/i] });

        test("says so", async ({ player }) => {
            await player.open({
                config: { name: "Missing", start: "home" },
                screens: {
                    home: { content: [{ type: "bitmap", src: "nope.png", alt: "LOST" }, "END"] },
                },
            });
            await expect(player.screen).toContainText("[IMAGE UNAVAILABLE: LOST]");
            await expect(player.screen).toContainText("END");
        });
    });
});

test.describe("progress", () => {
    test.use({ reducedMotion: "no-preference" });

    const progress: Program = {
        config: { name: "Progress", start: "home", reveal: "instant" },
        screens: {
            home: {
                content: [
                    { type: "link", text: "> RUN", action: { screen: "run" } },
                    { type: "link", text: "> FAIL", action: { screen: "fail" } },
                    { type: "link", text: "> ABORTABLE", action: { screen: "abortable" } },
                ],
            },
            run: {
                content: [
                    {
                        type: "progress",
                        label: "LOAD ",
                        duration: 1200,
                        onComplete: { after: 100, action: { screen: "done" } },
                    },
                ],
            },
            fail: {
                content: [
                    {
                        type: "progress",
                        label: "SEND ",
                        from: 0,
                        to: 100,
                        duration: 600,
                        interrupt: { at: 40, text: "FAILED" },
                    },
                    "AFTER",
                ],
            },
            abortable: {
                content: [
                    {
                        type: "progress",
                        label: "UPLOAD ",
                        duration: 20000,
                        interrupt: {
                            key: "Escape",
                            text: "ABORTED",
                            after: 400,
                            action: { screen: "home" },
                        },
                    },
                ],
            },
            done: { content: ["COMPLETE"] },
        },
    };

    const percent = async (player: Player) =>
        Number((await player.text()).match(/(\d+)%/)?.[1] ?? Number.NaN);

    test("counts up over its duration, then acts", async ({ player }) => {
        await player.open(progress);
        await player.link("> RUN").click();
        await expect.poll(() => percent(player)).toBeGreaterThan(0);
        expect(await percent(player)).toBeLessThan(100);
        await expect(player.screen).toContainText("COMPLETE", { timeout: 5000 });
    });

    test("can fail partway, and the screen carries on", async ({ player }) => {
        await player.open(progress);
        await player.link("> FAIL").click();
        await expect(player.screen).toContainText("FAILED");
        await expect(player.screen).toContainText("AFTER");
    });

    test("can be aborted with a key", async ({ page, player }) => {
        await player.open(progress);
        await player.link("> ABORTABLE").click();
        await expect.poll(() => percent(player)).toBeGreaterThanOrEqual(0);
        await page.keyboard.press("Escape");
        await expect(player.screen).toContainText("ABORTED");
        await expect(player.link("> RUN")).toBeVisible();
    });
});

test.describe("section", () => {
    const sections: Program = {
        config: { name: "Sections", start: "home" },
        screens: {
            home: {
                content: [
                    {
                        type: "section",
                        title: "CREW MANIFEST",
                        indent: 4,
                        content: [
                            "CAPT. R. OKAFOR      COMMAND",
                            { type: "link", text: "> VANCE'S LOG", action: { screen: "log" } },
                        ],
                    },
                    {
                        type: "section",
                        title: "CARGO",
                        open: true,
                        markers: { closed: "▶", open: "▼" },
                        content: ["12 CRATES"],
                    },
                    "END OF DIRECTORY",
                ],
            },
            log: { content: ["LOG", { type: "link", text: "> BACK", action: { screen: "home" } }] },
        },
    };
    const header = (player: import("./fixtures.ts").Player, title: string) =>
        player.screen.locator("button.section-header", { hasText: title });

    test("starts collapsed, and expands and collapses with a click", async ({ player }) => {
        await player.open(sections);
        const crew = header(player, "CREW MANIFEST");
        await expect(crew).toContainText("[+] CREW MANIFEST");
        await expect(crew).toHaveAttribute("aria-expanded", "false");
        await expect(player.screen).not.toContainText("OKAFOR");

        await crew.click();
        await expect(crew).toContainText("[-] CREW MANIFEST");
        await expect(crew).toHaveAttribute("aria-expanded", "true");
        await expect(player.screen).toContainText("OKAFOR");
        // the rest of the screen moves down, under it
        const order = await player.screen.evaluate((screen) => screen.textContent ?? "");
        expect(order.indexOf("OKAFOR")).toBeLessThan(order.indexOf("END OF DIRECTORY"));

        await crew.click();
        await expect(player.screen).not.toContainText("OKAFOR");
    });

    test("indents its contents by whole columns", async ({ player }) => {
        await player.open(sections);
        const crew = header(player, "CREW MANIFEST");
        await crew.click();
        const line = player.screen.locator(".section-content .text").first();
        await expect(line).toContainText("OKAFOR");
        const [headerBox, lineBox, charWidth] = await Promise.all([
            crew.boundingBox(),
            line.boundingBox(),
            crew.evaluate((element) => {
                const probe = document.createElement("span");
                probe.textContent = "0".repeat(100);
                element.append(probe);
                const width = probe.getBoundingClientRect().width / 100;
                probe.remove();
                return width;
            }),
        ]);
        expect((lineBox?.x ?? 0) - (headerBox?.x ?? 0)).toBeCloseTo(4 * charWidth, 0);
    });

    test("can start open, with its own markers", async ({ player }) => {
        await player.open(sections);
        await expect(header(player, "CARGO")).toContainText("▼ CARGO");
        await expect(player.screen).toContainText("12 CRATES");
    });

    test("works from the keyboard, and its contents work", async ({ page, player }) => {
        await player.open(sections);
        await header(player, "CREW MANIFEST").focus();
        await page.keyboard.press("Enter");
        await player.link("> VANCE'S LOG").click();
        await expect(player.screen).toContainText("LOG");
        // and it's still open on the way back
        await player.link("> BACK").click();
        await expect(player.screen).toContainText("OKAFOR");
    });

    test.describe("with motion", () => {
        test.use({ reducedMotion: "no-preference" });

        test("types its contents in as it expands", async ({ player }) => {
            await player.open(sections);
            await player.tap();
            await header(player, "CREW MANIFEST").click();
            await expect(player.screen.locator(".section-content .reveal-cursor")).not.toHaveCount(
                0,
            );
            await expect(player.link("> VANCE'S LOG")).toBeVisible();
        });
    });
});

test.describe("buttons", () => {
    const row: Program = {
        config: { name: "Buttons", start: "home" },
        screens: {
            home: {
                content: [
                    "LAUNCH?",
                    {
                        type: "buttons",
                        align: "center",
                        buttons: [
                            { text: "ENGAGE", key: "e", action: { screen: "launched" } },
                            { text: "ABORT", key: "a", action: { dialog: "aborted" } },
                        ],
                    },
                ],
            },
            launched: { content: ["LAUNCHED"] },
        },
        dialogs: { aborted: { type: "alert", content: "ABORTED" } },
    };
    const button = (player: import("./fixtures.ts").Player, name: string) =>
        player.screen.getByRole("button", { name });

    test("draw as bracketed labels in a row, centered", async ({ player }) => {
        await player.open(row);
        const engage = await button(player, "[ ENGAGE ]").boundingBox();
        const abort = await button(player, "[ ABORT ]").boundingBox();
        const screen = await player.screen.boundingBox();
        // side by side, on the same line, only as wide as their labels
        expect(engage?.y).toBe(abort?.y);
        expect((engage?.x ?? 0) + (engage?.width ?? 0)).toBeLessThan(abort?.x ?? 0);
        expect(engage?.width ?? 0).toBeLessThan((screen?.width ?? 0) / 4);
        // and the pair sits in the middle
        const middle = ((engage?.x ?? 0) + (abort?.x ?? 0) + (abort?.width ?? 0)) / 2;
        const center = (screen?.x ?? 0) + (screen?.width ?? 0) / 2;
        expect(Math.abs(middle - center)).toBeLessThan((engage?.width ?? 0) / 2);
    });

    test("press with a click", async ({ player }) => {
        await player.open(row);
        await button(player, "[ ABORT ]").click();
        await expect(player.dialog).toContainText("ABORTED");
    });

    test("press with their hotkeys, underlined in the label", async ({ page, player }) => {
        await player.open(row);
        await expect(button(player, "[ ENGAGE ]").locator("u")).toHaveText("E");
        // even with another control focused
        await button(player, "[ ABORT ]").focus();
        await page.keyboard.press("e");
        await expect(player.screen).toContainText("LAUNCHED");
    });

    test("move along the row with the arrow keys", async ({ page, player }) => {
        await player.open(row);
        await button(player, "[ ENGAGE ]").focus();
        await page.keyboard.press("ArrowRight");
        await expect(button(player, "[ ABORT ]")).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(player.dialog).toContainText("ABORTED");
    });
});

test.describe("number", () => {
    const keypad: Program = {
        config: { name: "Keypad", start: "home", variables: { fuel: 0 } },
        screens: {
            home: {
                content: [
                    {
                        type: "number",
                        prompt: "CODE: ",
                        digits: 4,
                        mask: true,
                        on: [{ equals: 1138, action: { screen: "open" } }],
                        otherwise: { dialog: "wrong" },
                    },
                    {
                        type: "number",
                        prompt: "FUEL: ",
                        min: 0,
                        max: 100,
                        variable: "fuel",
                        otherwise: { screen: "fuelled" },
                        unknown: "0 TO 100 ONLY",
                    },
                ],
            },
            open: { content: ["DOOR OPEN"] },
            fuelled: { content: ["FUEL SET TO {fuel}"] },
        },
        dialogs: { wrong: { type: "alert", content: "WRONG CODE" } },
    };
    const field = (player: import("./fixtures.ts").Player, n: number) =>
        player.screen.locator(".number").nth(n);

    test("takes only digits, up to its length, masked", async ({ page, player }) => {
        await player.open(keypad);
        const code = field(player, 0);
        await expect(code.locator("input")).toBeFocused();
        await page.keyboard.type("1a1-3.89");
        await expect(code.locator("input")).toHaveValue("1138");
        await expect(code.locator(".prompt-echo")).toContainText("****");
        await page.keyboard.press("Enter");
        await expect(player.screen).toContainText("DOOR OPEN");
    });

    test("runs otherwise for any other number", async ({ page, player }) => {
        await player.open(keypad);
        await page.keyboard.type("0000");
        await page.keyboard.press("Enter");
        await expect(player.dialog).toContainText("WRONG CODE");
    });

    test("turns away numbers out of range, and stores one in its variable", async ({
        page,
        player,
    }) => {
        await player.open(keypad);
        const fuel = field(player, 1).locator("input");
        await fuel.focus();
        await page.keyboard.type("250");
        await page.keyboard.press("Enter");
        await expect(field(player, 1).locator(".prompt-message")).toHaveText("0 TO 100 ONLY");
        await page.keyboard.type("75");
        await page.keyboard.press("Enter");
        await expect(player.screen).toContainText("FUEL SET TO 75");
    });

    test("steps with the arrow keys, within its range", async ({ page, player }) => {
        await player.open(keypad);
        const fuel = field(player, 1).locator("input");
        await fuel.focus();
        await page.keyboard.press("ArrowUp");
        await expect(fuel).toHaveValue("0");
        await page.keyboard.press("Shift+ArrowUp");
        await page.keyboard.press("ArrowUp");
        await expect(fuel).toHaveValue("11");
        await page.keyboard.press("ArrowDown");
        await expect(fuel).toHaveValue("10");
        for (let i = 0; i < 12; i++) await page.keyboard.press("Shift+ArrowUp");
        await expect(fuel).toHaveValue("100");
        await page.keyboard.press("Enter");
        await expect(player.screen).toContainText("FUEL SET TO 100");
    });

    test("asks phones for the number keypad", async ({ player }) => {
        await player.open(keypad);
        await expect(field(player, 0).locator("input")).toHaveAttribute("inputmode", "numeric");
    });
});

test.describe("meter", () => {
    const gauges: Program = {
        config: { name: "Meters", start: "home", variables: { hull: 60 } },
        screens: {
            home: {
                content: [
                    {
                        type: "meter",
                        label: "HULL ",
                        variable: "hull",
                        unit: "%",
                        on: [{ atMost: 40, className: "alert" }],
                    },
                    { type: "slider", label: "SET ", variable: "hull", step: 10 },
                ],
            },
        },
    };

    test("follows its variable, and turns red when it's low", async ({ page, player }) => {
        await player.open(gauges);
        const meter = player.screen.locator(".meter");
        await expect(meter).toContainText("60%");
        await expect(meter).not.toHaveClass(/\balert\b/);
        await player.screen.getByRole("slider", { name: "SET" }).focus();
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("ArrowLeft");
        await expect(meter).toContainText("40%");
        await expect(meter).toHaveClass(/\balert\b/);
    });
});

test.describe("choice", () => {
    const choosing: Program = {
        config: { name: "Choice", start: "home", variables: { power: "NORMAL" } },
        screens: {
            home: {
                content: [
                    {
                        type: "choice",
                        label: "POWER: ",
                        options: ["ECO", "NORMAL", "MAX"],
                        variable: "power",
                    },
                    "NOW {power}",
                ],
            },
        },
    };

    test("chooses with a click, or with the arrow keys", async ({ page, player }) => {
        await player.open(choosing);
        const choice = player.screen.locator(".choice");
        await expect(choice).toContainText("(•) NORMAL");
        await expect(player.screen).toContainText("NOW NORMAL");

        await choice.locator("label", { hasText: "MAX" }).click();
        await expect(choice).toContainText("(•) MAX");
        await expect(player.screen).toContainText("NOW MAX");
        await expect(choice.getByRole("radio", { name: "MAX" })).toBeChecked();

        // (Safari doesn't focus a radio button that's clicked, so focus it as a tab would)
        await choice.getByRole("radio", { name: "MAX" }).focus();
        await page.keyboard.press("ArrowLeft");
        await expect(choice).toContainText("(•) NORMAL");
        await expect(player.screen).toContainText("NOW NORMAL");
    });
});

test.describe("menu", () => {
    const menu: Program = {
        config: { name: "Menu", start: "home" },
        screens: {
            home: {
                content: [
                    "MAIN MENU",
                    {
                        type: "menu",
                        items: [
                            { text: "DIAGNOSTICS", action: { screen: "picked" } },
                            { text: "NAVIGATION", action: { screen: "picked" } },
                            { text: "SHUT DOWN", key: "s", action: { dialog: "sure" } },
                        ],
                    },
                ],
            },
            picked: {
                content: ["PICKED", { type: "link", text: "> BACK", action: { screen: "home" } }],
            },
        },
        dialogs: { sure: { type: "alert", content: "SHUTTING DOWN" } },
    };
    const item = (player: import("./fixtures.ts").Player, name: string) =>
        player.screen.getByRole("menuitem", { name: new RegExp(name) });

    test("highlights an item, moved with the arrow keys and chosen with Enter", async ({
        page,
        player,
    }) => {
        await player.open(menu);
        await expect(item(player, "DIAGNOSTICS")).toBeFocused();
        await expect(item(player, "DIAGNOSTICS")).toHaveClass(/selected/);
        await expect(item(player, "DIAGNOSTICS")).toContainText("> DIAGNOSTICS");
        await page.keyboard.press("ArrowDown");
        await expect(item(player, "NAVIGATION")).toHaveClass(/selected/);
        await expect(item(player, "NAVIGATION")).toContainText("> NAVIGATION");
        await expect(item(player, "DIAGNOSTICS")).not.toHaveClass(/selected/);
        await page.keyboard.press("Enter");
        await expect(player.screen).toContainText("PICKED");
        // back again (by keyboard: a mouse left over the menu would move the highlight),
        // and the highlight is where it was
        await player.link("> BACK").focus();
        await page.keyboard.press("Enter");
        await expect(item(player, "NAVIGATION")).toHaveClass(/selected/);
    });

    test("follows the mouse, and chooses with a click or a hotkey", async ({ page, player }) => {
        await player.open(menu);
        await item(player, "SHUT DOWN").hover();
        await expect(item(player, "SHUT DOWN")).toHaveClass(/selected/);
        await page.keyboard.press("Escape");
        await page.keyboard.press("s");
        await expect(player.dialog).toContainText("SHUTTING DOWN");
    });
});

test.describe("multiple choice", () => {
    const ticking: Program = {
        config: { name: "Choices", start: "home", variables: { lights: false, air: true } },
        screens: {
            home: {
                content: [
                    {
                        type: "choice",
                        label: "SYSTEMS: ",
                        multiple: true,
                        options: ["LIGHTS", "AIR"],
                        variables: ["lights", "air"],
                    },
                    "LIGHTS {lights}, AIR {air}",
                ],
            },
        },
    };

    test("ticks options on and off, with a click or Space", async ({ page, player }) => {
        await player.open(ticking);
        const choice = player.screen.locator(".choice");
        await expect(choice).toContainText("[ ] LIGHTS");
        await expect(choice).toContainText("[X] AIR");

        await choice.locator("label", { hasText: "LIGHTS" }).click();
        await expect(choice).toContainText("[X] LIGHTS");
        await expect(choice).toContainText("[X] AIR");
        await expect(player.screen).toContainText("LIGHTS true, AIR true");

        await choice.getByRole("checkbox", { name: "AIR" }).focus();
        await page.keyboard.press("Space");
        await expect(choice).toContainText("[ ] AIR");
        await expect(player.screen).toContainText("LIGHTS true, AIR false");
    });

    test("highlights in the alert color, with that class", async ({ player }) => {
        await player.open({
            config: {
                name: "Alert",
                start: "home",
                theme: { fg: "#33ff66", bg: "#001100", alert: "#ffff00" },
            },
            screens: {
                home: {
                    content: [
                        { type: "choice", multiple: true, options: ["SEALED"], className: "alert" },
                    ],
                },
            },
        });
        const option = player.screen.locator(".choice-option");
        await option.hover();
        await expect(option).toHaveCSS("background-color", "rgb(255, 255, 0)");
    });
});

test.describe("bitmap width in columns", () => {
    const sized: Program = {
        config: { name: "Sized", start: "home" },
        screens: {
            home: {
                content: [
                    "12345678901234567890",
                    { type: "bitmap", src: "e2e-images/sunset-grid.png", alt: "SUNSET", cols: 20 },
                    { type: "bitmap", src: "e2e-images/sunset-grid.png", alt: "HUGE", cols: 500 },
                ],
            },
        },
    };

    test("is that many characters wide, with its height in proportion", async ({ player }) => {
        await player.open(sized);
        const image = player.screen.getByRole("img", { name: "SUNSET" });
        await expect(image).toBeVisible();
        const { width, height, natural, line } = await image.evaluate((canvas) => {
            const text = document.querySelector(".screen .text [aria-hidden='true']");
            const c = canvas as HTMLCanvasElement;
            const box = c.getBoundingClientRect();
            return {
                width: box.width,
                height: box.height,
                natural: c.width / c.height,
                line: text?.getBoundingClientRect().width ?? 0,
            };
        });
        // as wide as the 20-character line above it
        expect(width).toBeCloseTo(line, 0);
        expect(width / height).toBeCloseTo(natural, 1);
    });

    test("shrinks to fit a narrower screen, keeping its shape", async ({ page, player }) => {
        await player.open(sized);
        const image = player.screen.getByRole("img", { name: "HUGE" });
        await expect(image).toBeVisible();
        const box = await image.boundingBox();
        const screen = await player.screen.boundingBox();
        expect(box?.width).toBeLessThanOrEqual((screen?.width ?? 0) + 1);
        const overflows = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
        );
        expect(overflows).toBe(false);
    });
});

test.describe("image reveal effects", () => {
    test.use({ reducedMotion: "no-preference" });
    const effects = ["pixelate", "raster", "dissolve", "depth", "glitch"] as const;

    /** Some pixels of the canvas: whether each is drawn (not transparent). */
    const coverage = (page: import("./fixtures.ts").Page) =>
        page.$eval(".bitmap canvas", (canvas) => {
            const c = canvas as HTMLCanvasElement;
            const data = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
            const at = (fx: number, fy: number) =>
                (data?.[
                    (Math.floor(fy * (c.height - 1)) * c.width + Math.floor(fx * (c.width - 1))) *
                        4 +
                        3
                ] ?? 0) > 0;
            return { top: at(0.5, 0.05), bottom: at(0.5, 0.95) };
        });

    for (const effect of effects) {
        test(`"${effect}" ends on the whole picture`, async ({ page, player }) => {
            await player.open({
                config: { name: "Fx", start: "home", reveal: "instant" },
                screens: {
                    home: {
                        content: [
                            {
                                type: "bitmap",
                                src: "e2e-images/sunset-grid.png",
                                alt: "PIC",
                                reveal: { type: effect, duration: 400 },
                            },
                            "AFTER",
                        ],
                    },
                },
            });
            await expect(player.screen).toContainText("AFTER");
            expect(await coverage(page)).toEqual({ top: true, bottom: true });
        });
    }

    test('"raster" draws from the top down', async ({ page, player }) => {
        await player.open({
            config: { name: "Fx", start: "home", reveal: "instant" },
            screens: {
                home: {
                    content: [
                        {
                            type: "bitmap",
                            src: "e2e-images/sunset-grid.png",
                            alt: "PIC",
                            reveal: { type: "raster", duration: 6000 },
                        },
                    ],
                },
            },
        });
        await expect.poll(async () => (await coverage(page)).top, { timeout: 5000 }).toBe(true);
        expect((await coverage(page)).bottom).toBe(false);
    });
});

test.describe("text files and ASCII images", () => {
    test.use({ expectedErrors: [/404|Failed to load/i] });

    const program: Program = {
        config: { name: "Art", start: "home", reveal: "instant" },
        screens: {
            home: {
                content: [
                    { type: "text", src: "data/art/satellite.txt", wrap: false },
                    { type: "text", src: "data/art/nope.txt" },
                    { type: "ascii", src: "e2e-images/sunset-grid.png", alt: "A SUNSET", cols: 40 },
                    "END",
                ],
            },
        },
    };

    test("a text file is shown exactly as written", async ({ player, request }) => {
        await player.open(program);
        await expect(player.screen).toContainText("END");
        const file = await (await request.get("data/art/satellite.txt")).text();
        const drawn = await player.screen
            .locator(".text [aria-hidden='true']")
            .first()
            .evaluate((element) => element.textContent ?? "");
        expect(drawn).toBe(file.replace(/\n+$/, ""));
        await expect(player.screen.locator(".text").nth(1)).toContainText(
            "[FILE UNAVAILABLE: data/art/nope.txt]",
        );
    });

    test("an image becomes text, as wide as asked, described for screen readers", async ({
        player,
    }) => {
        await player.open(program);
        const ascii = player.screen.getByRole("img", { name: "A SUNSET" });
        await expect(ascii).toBeVisible();
        const drawn = await ascii
            .locator("[aria-hidden='true']")
            .evaluate((element) => element.textContent ?? "");
        const lines = drawn.split("\n");
        expect(lines.length).toBeGreaterThan(3);
        expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(40);
        expect(drawn.replace(/\s/g, "").length).toBeGreaterThan(20);
    });
});

test.describe("checklist and counter", () => {
    test.use({ reducedMotion: "no-preference" });

    const working: Program = {
        config: { name: "Working", start: "home", reveal: "instant" },
        screens: {
            home: {
                content: [
                    {
                        type: "checklist",
                        items: ["PUMPS", { text: "VALVES", status: "[FAIL]", delay: 600 }],
                        delay: 100,
                        width: 30,
                    },
                    { type: "counter", label: "MEMORY: ", to: 640, unit: "K", done: " OK" },
                    "END",
                ],
            },
        },
    };

    test("shows each line's status after a moment, then counts", async ({ player }) => {
        await player.open(working);
        // (what's shown so far: the rest is there too, hidden, keeping its space)
        const checklist = player.screen.locator(".checklist [aria-hidden='true'] > :first-child");
        await expect(checklist).toContainText("PUMPS");
        await expect(checklist).toContainText("VALVES");
        await expect(checklist).not.toContainText("[FAIL]");
        await expect(checklist).toContainText(`VALVES ${".".repeat(16)} [FAIL]`);
        await expect(checklist).toContainText(`PUMPS ${".".repeat(17)} [ OK ]`);

        const counter = player.screen.locator(".counter [aria-hidden='true']");
        await expect(counter).toHaveText(/MEMORY: \d+K/);
        await expect(counter).toHaveText("MEMORY: 640K OK");
        await expect(player.screen).toContainText("END");
    });
});

test.describe("boot preset", () => {
    test.use({ reducedMotion: "no-preference" });

    const booting: Program = {
        config: { name: "Boot", start: "boot" },
        screens: {
            boot: {
                preset: { type: "boot", title: "ACME OS", pause: true, next: "home" },
            },
            home: { content: ["HOME"] },
        },
    } as Program;

    test("starts up, then waits for a key before its next screen", async ({ page, player }) => {
        await player.open(booting);
        await expect(player.screen).toContainText("ACME OS");
        await expect(player.screen).toContainText("MEMORY TEST: 640K OK");
        await expect(player.screen).toContainText("STARTING TERMINAL SERVICES");
        // shown in full (a key press while it types would only skip to it)
        await expect(
            player.screen.locator(".pause [aria-hidden='true'] > :first-child"),
        ).toHaveText("PRESS ANY KEY TO CONTINUE", { timeout: 15_000 });
        await expect(player.screen).toContainText("BOOT COMPLETE.");
        await page.keyboard.press("Enter");
        await expect(player.screen).toContainText("HOME");
        await expect(player.screen).not.toContainText("ACME OS");
    });
});

test.describe("shutdown, error and crash presets", () => {
    test.use({ reducedMotion: "no-preference" });

    const presets = {
        config: { name: "Presets", start: "home", reveal: "instant" },
        screens: {
            home: {
                content: [
                    "HOME",
                    { type: "link", text: "> SHUTDOWN", action: { screen: "shutdown" } },
                    { type: "link", text: "> ERROR", action: { screen: "error" } },
                    { type: "link", text: "> CRASH", action: { screen: "crash" } },
                ],
            },
            shutdown: { preset: { type: "shutdown", checks: false, after: 100 } },
            error: { preset: { type: "error", title: "FAILURE", code: "CODE 42" } },
            crash: { preset: { type: "crash", message: "KABOOM", next: "home" } },
        },
    } as Program;

    const go = async (player: Player, link: string) => {
        await player.open(presets);
        await player.screen.getByRole("button", { name: link }).click();
    };

    test("shutdown switches the screen off, and a key switches it back on", async ({
        page,
        player,
    }) => {
        await go(player, "> SHUTDOWN");
        await expect(player.screen).toContainText("IT IS NOW SAFE TO TURN OFF YOUR COMPUTER.");
        await expect(player.screen).toHaveClass(/powering-off/);
        await expect(player.screen).toHaveClass(/powered-off/);
        // the monitor is off: pure black over everything, effects and all
        await expect
            .poll(() =>
                page.evaluate(() => {
                    const cover = getComputedStyle(document.body, "::after");
                    return [cover.backgroundColor, cover.opacity, cover.zIndex];
                }),
            )
            .toEqual(["rgb(0, 0, 0)", "1", "3"]);
        await expect(player.screen.locator(".pause")).toContainText("PRESS ANY KEY TO SWITCH ON");
        await page.keyboard.press("x");
        await expect(player.screen).toContainText("HOME");
    });

    test("an error shows a blinking box in the alert color", async ({ page, player }) => {
        await go(player, "> ERROR");
        const box = player.screen.locator(".error-box");
        await expect(box).toContainText("FAILURE");
        await expect(box).toContainText("CODE 42");
        await expect(box).toHaveClass(/alert/);
        expect(await box.evaluate((el) => getComputedStyle(el).animationName)).toBe(
            "error-box-blink",
        );
        await expect(
            player.screen.locator(".pause [aria-hidden='true'] > :first-child"),
        ).toHaveText("PRESS ANY KEY TO RESTART");
        await page.keyboard.press("Enter");
        await expect(player.screen).toContainText("HOME");
    });

    test("a crash keeps changing, with its message, until a key", async ({ page, player }) => {
        await go(player, "> CRASH");
        const garbage = player.screen.locator(".crash pre");
        await expect(garbage).not.toBeEmpty();
        const first = await garbage.textContent();
        await expect.poll(() => garbage.textContent()).not.toBe(first);
        // (it surfaces now and then, for about a second, so look often)
        await expect
            .poll(() => garbage.textContent(), { intervals: [100], timeout: 8000 })
            .toContain("KABOOM");
        await expect(player.screen.getByRole("alert")).toHaveText("KABOOM");
        await page.keyboard.press("Enter");
        await expect(player.screen).toContainText("HOME");
        await expect(page.locator(".crash")).toHaveCount(0);
    });
});

test.describe("crash, with reduced motion", () => {
    test("is a still picture", async ({ player }) => {
        await player.open({
            config: { name: "Crash", start: "home" },
            screens: {
                home: { content: [{ type: "link", text: "> CRASH", action: { screen: "crash" } }] },
                crash: { preset: { type: "crash", message: "STILL" } },
            },
        } as Program);
        await player.screen.getByRole("button", { name: "> CRASH" }).click();
        const garbage = player.screen.locator(".crash pre");
        await expect(garbage).toContainText("STILL");
        const first = await garbage.textContent();
        await player.page.waitForTimeout(500);
        expect(await garbage.textContent()).toBe(first);
    });
});

test.describe("visual", () => {
    const visuals = (kind: string, extra: object = {}): Program =>
        ({
            config: { name: "Visuals", start: "home", reveal: "instant" },
            screens: {
                home: {
                    content: ["1234567890", { type: "visual", kind, cols: 10, rows: 4, ...extra }],
                },
            },
        }) as Program;

    // the canvas's pixels, to see that something is drawn, and whether it changes
    const pixels = (player: Player) =>
        player.screen.locator(".visual canvas").evaluate((canvas: HTMLCanvasElement) => {
            const context = canvas.getContext("2d");
            const data = context?.getImageData(0, 0, canvas.width, canvas.height).data ?? [];
            let lit = 0;
            let sum = 0;
            for (let i = 3; i < data.length; i += 4) {
                if ((data[i] ?? 0) > 0) lit++;
                sum = (sum * 31 + (data[i] ?? 0)) % 1_000_003;
            }
            return { lit, sum };
        });

    test("is sized in characters and lines, and described", async ({ player }) => {
        await player.open(visuals("radar"));
        const canvas = player.screen.getByRole("img", { name: "A radar sweep" });
        await expect(canvas).toBeVisible();
        const { width, height, line } = await canvas.evaluate((c) => {
            // the ten characters' width, and the height of their line (the block they're in)
            const text = document.querySelector(".screen .text [aria-hidden='true']");
            const block = document.querySelector(".screen .text");
            return {
                width: c.getBoundingClientRect().width,
                height: c.getBoundingClientRect().height,
                line: {
                    width: text?.getBoundingClientRect().width ?? 0,
                    height: block?.getBoundingClientRect().height ?? 0,
                },
            };
        });
        expect(width).toBeCloseTo(line.width, 0);
        expect(height).toBeCloseTo(line.height * 4, 0);
    });

    test.describe("moving", () => {
        test.use({ reducedMotion: "no-preference" });

        for (const [kind, extra] of [
            ["waveform", {}],
            ["chart", { style: "bars" }],
            ["radar", {}],
            ["wireframe", { shape: "icosahedron" }],
            ["wireframe", { shape: "terrain" }],
        ] as const) {
            test(`draws a ${kind} ${"shape" in extra ? extra.shape : ""}, and keeps drawing`, async ({
                player,
            }) => {
                await player.open(visuals(kind, extra));
                await expect.poll(async () => (await pixels(player)).lit).toBeGreaterThan(20);
                const first = (await pixels(player)).sum;
                await expect.poll(async () => (await pixels(player)).sum).not.toBe(first);
            });
        }
    });

    test("is a still picture with reduced motion", async ({ player, page }) => {
        await player.open(visuals("wireframe"));
        await expect.poll(async () => (await pixels(player)).lit).toBeGreaterThan(20);
        const first = await pixels(player);
        await page.waitForTimeout(400);
        expect(await pixels(player)).toEqual(first);
    });
});

test.describe("spinner", () => {
    test.use({ reducedMotion: "no-preference" });

    const spinning = {
        config: { name: "Spinners", start: "home", reveal: "instant" },
        screens: {
            home: {
                content: [
                    { type: "spinner", label: "LOAD ", duration: 1500, done: "OK" },
                    {
                        type: "spinner",
                        label: "GET ",
                        duration: 20_000,
                        interrupt: { key: "Escape", text: "ABORTED" },
                    },
                    { type: "spinner", label: "WAIT ", done: "GO" },
                    "END",
                ],
            },
        },
    } as Program;

    // what each spinner shows (not what screen readers get)
    const shown = (player: Player, n: number) =>
        player.screen.locator(".spinner").nth(n).locator("[aria-hidden='true']");

    test("turns, finishes, aborts at its key, and waits for a key", async ({ page, player }) => {
        await player.open(spinning);
        const first = await shown(player, 0).textContent();
        await expect.poll(() => shown(player, 0).textContent()).not.toBe(first);
        await expect(shown(player, 0)).toHaveText("LOAD OK");

        await expect(shown(player, 1)).toHaveText(/^GET .$/);
        await page.keyboard.press("Escape");
        await expect(shown(player, 1)).toHaveText("GET ABORTED");

        await expect(shown(player, 2)).toHaveText(/^WAIT .$/);
        await page.waitForTimeout(300);
        await expect(player.screen).not.toContainText("END");
        await page.keyboard.press("x");
        await expect(shown(player, 2)).toHaveText("WAIT GO");
        await expect(player.screen).toContainText("END");
    });

    test("is announced by its label, not every turn", async ({ player }) => {
        await player.open(spinning);
        await expect(player.screen.getByRole("status").first()).toContainText("LOAD");
        await expect(player.screen.locator(".spinner .sr-only").first()).toHaveText("LOAD");
    });
});

test.describe("hexdump", () => {
    const dumps = {
        config: { name: "Hex", start: "home", reveal: "instant" },
        screens: {
            home: {
                content: [
                    { type: "hexdump", text: "HELLO", perRow: 8 },
                    { type: "hexdump", size: 64, text: "CODE 42", highlight: ["42"], perRow: 16 },
                    { type: "link", text: "> EDITOR", action: { screen: "editor" } },
                    { type: "link", text: "> FILE", action: { screen: "file" } },
                ],
            },
            editor: {
                preset: { type: "hexeditor", file: "TEST.BIN", size: 512, next: "home" },
            },
            scrolling: {
                content: [
                    {
                        type: "hexdump",
                        size: 4096,
                        text: "FOUND IT",
                        at: 3000,
                        highlight: ["FOUND IT"],
                        rows: 4,
                        perRow: 16,
                        status: "{offset}",
                        autoscroll: 40,
                    },
                    {
                        type: "hexdump",
                        size: 4096,
                        text: "FOUND IT",
                        at: 3000,
                        highlight: ["FOUND IT"],
                        rows: 4,
                        perRow: 16,
                        status: "{offset}",
                        autoscroll: 60,
                        stopAt: "highlight",
                    },
                ],
            },
            file: {
                content: [
                    { type: "hexdump", src: "e2e-images/sunset-grid.png", perRow: 8 },
                    { type: "hexdump", src: "data/missing.bin" },
                ],
            },
        },
    } as Program;

    test("shows bytes as hex and text, with highlights", async ({ player }) => {
        await player.open(dumps);
        const first = player.screen.locator(".hexdump").first();
        await expect(first.locator(".hexdump-row")).toHaveText([
            "00000000  48 45 4C 4C  4F              |HELLO|   ",
        ]);
        await expect(first).toHaveAccessibleName("Hex dump, 5 bytes");
        const marked = player.screen.locator(".hexdump").nth(1).locator(".mark");
        // "42" in hex and as text
        await expect(marked).toHaveText(["34", "32", "4", "2"]);
        await expect(marked.first()).toHaveCSS("color", "rgb(255, 60, 0)");
    });

    test("shows a file's bytes, or says it can't", async ({ player, page }) => {
        await serveTestImages(page);
        await player.open(dumps);
        await player.screen.getByRole("button", { name: "> FILE" }).click();
        // a PNG starts 89 50 4E 47 ("‰PNG")
        await expect(player.screen.locator(".hexdump-row").first()).toContainText(
            "00000000  89 50 4E 47  0D 0A 1A 0A  |.PNG....|",
        );
        await expect(player.screen).toContainText("[FILE UNAVAILABLE: data/missing.bin]");
    });

    test("is an editor to move through, and leave", async ({ page, player }) => {
        await player.open(dumps);
        await player.screen.getByRole("button", { name: "> EDITOR" }).click();
        await expect(page.locator(".bar-header")).toContainText("HEXEDIT 2.1  TEST.BIN");
        const editor = player.screen.locator(".hexdump");
        const status = page.locator(".hexdump-status-bar");
        await expect(status).toContainText("OFFSET 00000000");
        // a status bar: at the bottom of the window, the whole way across
        const box = await status.boundingBox();
        const viewport = page.viewportSize();
        expect(box?.width).toBe(viewport?.width);
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(viewport?.height ?? 0, 0);
        await expect(editor).toBeFocused();
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowDown");
        const perRow = await editor.locator(".hexdump-row").first().locator("[data-byte]").count();
        const expected = (1 + perRow / 2).toString(16).toUpperCase().padStart(8, "0");
        await expect(status).toContainText(`OFFSET ${expected}`);
        await page.keyboard.press("End");
        await expect(status).toContainText("OFFSET 000001FF");
        // the last row is in view
        await expect(editor.locator(".hexdump-row").last()).toContainText("000001F");

        // a click moves the cursor, and doesn't leave
        await editor.locator(".hexdump-row").first().locator("[data-byte]").nth(2).click();
        await expect(status).toContainText(/OFFSET 000001[0-9A-F]{2}/);
        await expect(page.locator(".bar-header")).toBeVisible();

        await page.keyboard.press("Escape");
        await expect(player.screen).toContainText("> EDITOR");

        await player.screen.getByRole("button", { name: "> EDITOR" }).click();
        await page.locator(".bar-header").getByRole("button", { name: "ESC: EXIT" }).click();
        await expect(player.screen).toContainText("> EDITOR");
    });

    test.describe("autoscroll", () => {
        test.use({ reducedMotion: "no-preference" });

        const offset = async (player: Player, n: number) =>
            Number.parseInt(
                (await player.screen.locator(".hexdump-status").nth(n).textContent()) ?? "0",
                16,
            );

        test("moves by itself until the player takes over", async ({ page, player }) => {
            await player.open({ ...dumps, config: { ...dumps.config, start: "scrolling" } });
            await expect.poll(() => offset(player, 0)).toBeGreaterThan(64);
            // a click on a byte takes over, and it stays put
            // (at a fixed point: the bytes under it keep changing)
            await player.screen
                .locator(".hexdump")
                .first()
                .click({ position: { x: 20, y: 10 } });
            const held = await offset(player, 0);
            await page.waitForTimeout(300);
            expect(await offset(player, 0)).toBe(held);
        });

        test("stops at the highlight", async ({ player }) => {
            await player.open({ ...dumps, config: { ...dumps.config, start: "scrolling" } });
            await expect.poll(() => offset(player, 1), { timeout: 10_000 }).toBe(3000);
            await expect(
                player.screen.locator(".hexdump").nth(1).locator(".mark.cursor").first(),
            ).toHaveText("46");
        });
    });
});
