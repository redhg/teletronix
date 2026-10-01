import { expect, type Locator, type Program, test } from "./fixtures.ts";

const program: Program = {
    config: { name: "Navigation", start: "home" },
    screens: {
        home: {
            content: [
                "HOME",
                { type: "link", text: "> ROOM", action: { screen: "room" } },
                {
                    type: "link",
                    text: "> LOCKED",
                    action: { dialog: "locked" },
                    secondaryAction: { screen: "secret" },
                },
                { type: "link", text: "> QUESTION", action: { screen: "question" } },
            ],
        },
        room: {
            content: ["ROOM", { type: "link", text: "> BACK", action: { screen: "home" } }],
        },
        secret: {
            content: ["SECRET", { type: "link", text: "> BACK", action: { screen: "home" } }],
        },
        question: {
            next: [
                { key: "y", action: { screen: "yes" } },
                { key: ["n", "Escape"], action: { screen: "home" } },
            ],
            content: ["QUESTION [Y/N]"],
        },
        yes: { next: { key: "any", action: { screen: "home" } }, content: ["YES"] },
    },
    dialogs: { locked: { type: "alert", content: "LOCKED" } },
};

test.describe("links", () => {
    test.beforeEach(async ({ player }) => {
        await player.open(program);
    });

    test("go to their screen", async ({ player }) => {
        await expect(player.screen).toContainText("HOME");
        await player.link("> ROOM").click();
        await expect(player.screen).toContainText("ROOM");
        await player.link("> BACK").click();
        await expect(player.screen).toContainText("HOME");
    });

    test("stretch across the screen", async ({ player }) => {
        const link = await player.link("> ROOM").boundingBox();
        const screen = await player.screen.boundingBox();
        expect(link?.width).toBeCloseTo(screen?.width ?? 0, 0);
    });

    test("follow their action on a plain click", async ({ player }) => {
        await player.link("> LOCKED").click();
        await expect(player.dialog).toContainText("LOCKED");
    });

    test("follow their secondary action on a shift-click", async ({ page, player }) => {
        // (holding shift through the click; Firefox leaves shiftKey off a modifier click)
        await page.keyboard.down("Shift");
        await player.link("> LOCKED").click();
        await page.keyboard.up("Shift");
        await expect(player.screen).toContainText("SECRET");
    });

    test("follow their secondary action on a right-click", async ({ player }) => {
        await player.link("> LOCKED").click({ button: "right" });
        await expect(player.screen).toContainText("SECRET");
    });

    test("follow their secondary action on Shift+Enter", async ({ page, player }) => {
        await player.link("> LOCKED").focus();
        await page.keyboard.press("Shift+Enter");
        await expect(player.screen).toContainText("SECRET");
    });

    test("follow their secondary action on a long mouse press", async ({ page, player }) => {
        const box = await player.link("> LOCKED").boundingBox();
        if (!box) throw new Error("no link");
        await page.mouse.move(box.x + 30, box.y + box.height / 2);
        await page.mouse.down();
        await expect(player.link("> LOCKED")).toHaveClass(/holding/);
        await expect(player.screen).toContainText("SECRET");
        await page.mouse.up();
        await expect(player.dialog).toHaveCount(0);
    });

    test("follow their action on a short mouse press", async ({ page, player }) => {
        const box = await player.link("> LOCKED").boundingBox();
        if (!box) throw new Error("no link");
        await page.mouse.move(box.x + 30, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(150);
        await page.mouse.up();
        await expect(player.dialog).toContainText("LOCKED");
    });
});

test.describe("touch", () => {
    test.use({ hasTouch: true });

    /** A finger on the link for `hold` ms, moving `drift` px partway through. */
    const touch = async (link: HTMLElement, [hold = 0, drift = 0]: number[]): Promise<void> => {
        const box = link.getBoundingClientRect();
        const at = (dx = 0) => ({
            bubbles: true,
            pointerType: "touch",
            isPrimary: true,
            clientX: box.x + 20 + dx,
            clientY: box.y + box.height / 2,
        });
        link.dispatchEvent(new PointerEvent("pointerdown", at()));
        await new Promise((resolve) => setTimeout(resolve, hold / 2));
        if (drift) link.dispatchEvent(new PointerEvent("pointermove", at(drift)));
        await new Promise((resolve) => setTimeout(resolve, hold / 2));
        if (!link.isConnected) return;
        link.dispatchEvent(new PointerEvent("pointerup", at(drift)));
        link.click();
    };

    test.beforeEach(async ({ player }) => {
        await player.open(program);
    });

    test("a long press follows the secondary action", async ({ player }) => {
        await player.link("> LOCKED").evaluate(touch, [1000, 0]);
        await expect(player.screen).toContainText("SECRET");
        await expect(player.dialog).toHaveCount(0);
    });

    test("a tap follows the action", async ({ player }) => {
        await player.link("> LOCKED").evaluate(touch, [100, 0]);
        await expect(player.dialog).toContainText("LOCKED");
    });

    test("dragging away cancels a long press", async ({ player }) => {
        await player.link("> LOCKED").evaluate(touch, [1000, 30]);
        await expect(player.screen).toContainText("HOME");
        await expect(player.link("> LOCKED")).not.toHaveClass(/holding/);
    });
});

test.describe("keys", () => {
    test.beforeEach(async ({ player }) => {
        await player.open(program);
        await player.link("> QUESTION").click();
        await expect(player.screen).toContainText("[Y/N]");
    });

    test("follow the first rule for the key", async ({ page, player }) => {
        await page.keyboard.press("y");
        await expect(player.screen).toContainText("YES");
    });

    test("can be listed", async ({ page, player }) => {
        await page.keyboard.press("Escape");
        await expect(player.screen).toContainText("HOME");
    });

    test("ignore keys without a rule", async ({ page, player }) => {
        await page.keyboard.press("x");
        await page.keyboard.press("Enter");
        await expect(player.screen).toContainText("[Y/N]");
    });

    test("a tap doesn't choose a key", async ({ player }) => {
        await player.tap();
        await expect(player.screen).toContainText("[Y/N]");
    });

    test('"any" takes any key, or a tap', async ({ page, player }) => {
        await page.keyboard.press("y");
        await page.keyboard.press("q");
        await expect(player.screen).toContainText("HOME");
        await player.link("> QUESTION").click();
        await page.keyboard.press("y");
        await expect(player.screen).toContainText("YES");
        await player.tap();
        await expect(player.screen).toContainText("HOME");
    });
});

test.describe("the context menu", () => {
    const opened = (target: Locator) =>
        target.evaluate(
            (element) =>
                new Promise<boolean>((resolve) => {
                    addEventListener(
                        "contextmenu",
                        (event) => setTimeout(() => resolve(!event.defaultPrevented)),
                        { once: true },
                    );
                    element.dispatchEvent(
                        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
                    );
                }),
        );

    test("is blocked by default", async ({ player }) => {
        await player.open(program);
        expect(await opened(player.screen.locator(".text").first())).toBe(false);
    });

    test("is allowed in text fields", async ({ player }) => {
        await player.open({
            config: { name: "Prompt", start: "home" },
            screens: {
                home: {
                    content: [
                        {
                            type: "prompt",
                            commands: [{ command: "x", action: { screen: "home" } }],
                        },
                    ],
                },
            },
        });
        expect(await opened(player.screen.locator("input"))).toBe(true);
    });

    test("can be allowed", async ({ player }) => {
        await player.open({
            config: { name: "Allowed", start: "home", blockContextMenu: false },
            screens: { home: { content: ["TEXT"] } },
        });
        expect(await opened(player.screen.locator(".text"))).toBe(true);
    });
});

test.describe("an address with #screen", () => {
    const program = {
        config: { name: "Hash", start: "home", reveal: "instant" },
        screens: { home: { content: ["HOME"] }, other: { content: ["OTHER"] } },
    } as Program;

    test("starts on that screen, and jumps when it changes", async ({ page, player }) => {
        await player.open(program, "#other");
        await expect(player.screen).toContainText("OTHER");
        await page.evaluate(() => {
            location.hash = "#home";
        });
        await expect(player.screen).toContainText("HOME");
    });

    test("starts as usual for a screen that isn't there", async ({ player }) => {
        await player.open(program, "#nowhere");
        await expect(player.screen).toContainText("HOME");
    });
});
