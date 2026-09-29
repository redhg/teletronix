import { expect, type Page, type Player, type Program, test } from "./fixtures.ts";

const back = { type: "link" as const, text: "> BACK", action: { screen: "home" } };
const IMAGE = "data/images/sunset-grid.png";

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
