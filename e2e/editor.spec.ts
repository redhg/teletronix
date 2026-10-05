import { readFile } from "node:fs/promises";
import { expect, type Page, type Program, test } from "./fixtures.ts";

const program: Program = {
    config: { name: "Editor", start: "home", header: [{ left: "SHIP" }] },
    screens: {
        home: {
            content: [
                "HOME SCREEN",
                { type: "link", text: "> OTHER", action: { screen: "other" } },
            ],
        },
        other: {
            parent: "home",
            content: [
                "OTHER SCREEN",
                { type: "link", text: "> WARN", action: { dialog: "warning" } },
            ],
        },
    },
    dialogs: { warning: { type: "alert", content: "DANGER AHEAD" } },
};

/** The editor, open on the test program. */
async function openEditor(page: Page): Promise<void> {
    await page.route("**/data/e2e.json", (route) => route.fulfill({ json: program }));
    await page.goto("./?edit&data=e2e");
    await expect(preview(page).locator(".screen")).toContainText("HOME SCREEN");
}
const preview = (page: Page) => page.frameLocator(".editor-preview");
const previewStyle = (
    page: Page,
    read: (body: CSSStyleDeclaration, root: CSSStyleDeclaration) => string | number,
) =>
    page
        .frames()
        .find((frame) => frame.url().includes("preview"))
        ?.evaluate((source) => {
            const body = getComputedStyle(document.body);
            const root = getComputedStyle(document.documentElement);
            return new Function("body", "root", `return (${source})(body, root)`)(body, root);
        }, read.toString());
const choose = async (page: Page, field: string, option: string) => {
    await page.getByRole("combobox", { name: field }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
};
const section = (page: Page, name: string) =>
    page
        .getByRole("navigation", { name: "Parts of the program" })
        .getByText(name, { exact: true })
        .click();

test.describe("the editor", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("opens a program, with a preview of it and no problems", async ({ page }) => {
        await openEditor(page);
        await expect(page.getByRole("textbox", { name: "File name" })).toHaveValue("e2e");
        await expect(page.getByText("No problems")).toBeVisible();
        await expect(page.getByLabel("name", { exact: true })).toHaveValue("Editor");
        await expect(page.getByText("Unsaved")).toHaveCount(0);
    });

    test("shows appearance changes in the preview at once", async ({ page }) => {
        await openEditor(page);
        await section(page, "Appearance");
        await choose(page, "Theme", "Amber");
        await expect
            .poll(() => previewStyle(page, (_, root) => root.getPropertyValue("--fg")))
            .toBe("#e07d0b");
        await choose(page, "Typeface", "IBM EGA");
        await expect.poll(() => previewStyle(page, (body) => body.fontFamily)).toContain("ibm-ega");
        await page.getByRole("switch", { name: /^Vignette/ }).click();
        await expect(preview(page).locator(".effects .vignette")).toHaveCount(1);
        await expect(page.getByText("Unsaved")).toBeVisible();
        // (still the same run of the program: appearance doesn't restart it)
        await expect(preview(page).locator(".screen")).toContainText("HOME SCREEN");
    });

    test("restarts the preview with other changes, on the same screen", async ({ page }) => {
        await openEditor(page);
        const header = page.getByRole("textbox", { name: "header" });
        await header.fill('[{ "left": "EDITED BAR" }]');
        await expect(preview(page).locator(".bar-header")).toContainText("EDITED BAR");
        await expect(preview(page).locator(".screen")).toContainText("HOME SCREEN");
    });

    test("picks a kind of reveal from a list, with its own options", async ({ page }) => {
        await openEditor(page);
        const written = async () => {
            const [download] = await Promise.all([
                page.waitForEvent("download"),
                page.getByRole("button", { name: /^Download/ }).click(),
            ]);
            return JSON.parse(await readFile(await download.path(), "utf8")).config.reveal;
        };
        await choose(page, "reveal", "teletype");
        // just the name, until an option is set
        expect(await written()).toBe("teletype");
        await page.getByRole("textbox", { name: "speed" }).fill("30");
        expect(await written()).toEqual({ type: "teletype", speed: 30 });
        await page.getByRole("textbox", { name: "speed" }).fill("");
        expect(await written()).toBe("teletype");
        // another kind has options of its own
        await choose(page, "reveal", "glitch");
        await expect(page.getByRole("textbox", { name: "speed" })).toHaveCount(0);
        await expect(page.getByRole("textbox", { name: "duration" })).toBeVisible();
    });

    test("finds mistakes, and undoes and redoes", async ({ page }) => {
        await openEditor(page);
        await page.getByLabel("name", { exact: true }).fill("");
        await expect(page.getByRole("button", { name: "1 problem" })).toBeVisible();
        await page.getByRole("button", { name: "1 problem" }).click();
        await expect(page.getByText("config.name")).toBeVisible();
        await page.keyboard.press("Escape");

        await page.getByRole("button", { name: "Undo" }).click();
        await expect(page.getByLabel("name", { exact: true })).toHaveValue("Editor");
        await expect(page.getByText("No problems")).toBeVisible();
        await expect(page.getByText("Unsaved")).toHaveCount(0);
        await page.getByRole("button", { name: "Redo" }).click();
        await expect(page.getByLabel("name", { exact: true })).toHaveValue("");
    });

    test("downloads the program, written as a person would", async ({ page }) => {
        await openEditor(page);
        await section(page, "Appearance");
        await choose(page, "Theme", "Green");
        // (the test server has no save endpoint, as on a hosted copy: it downloads)
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.getByRole("button", { name: /^Download/ }).click(),
        ]);
        expect(download.suggestedFilename()).toBe("e2e.json");
        const text = await readFile(await download.path(), "utf8");
        expect(JSON.parse(text)).toEqual({
            ...program,
            config: { ...program.config, theme: "green" },
        });
        expect(text).toContain('"warning": { "type": "alert", "content": "DANGER AHEAD" }');
    });

    test("opens a file, and starts a new program", async ({ page }) => {
        await openEditor(page);
        await page.getByRole("button", { name: "File" }).click();
        const [chooser] = await Promise.all([
            page.waitForEvent("filechooser"),
            page.getByRole("menuitem", { name: "Open a file…" }).click(),
        ]);
        await chooser.setFiles({
            name: "station.json",
            mimeType: "application/json",
            buffer: Buffer.from(
                JSON.stringify({
                    config: { name: "Station", start: "deck" },
                    screens: { deck: { content: ["ON DECK"] } },
                }),
            ),
        });
        await expect(page.getByRole("textbox", { name: "File name" })).toHaveValue("station");
        await expect(preview(page).locator(".screen")).toContainText("ON DECK");

        page.once("dialog", (dialog) => dialog.accept());
        await page.getByRole("button", { name: "File" }).click();
        await page.getByRole("menuitem", { name: "New program" }).click();
        await expect(page.getByRole("textbox", { name: "File name" })).toHaveValue("new-program");
        await expect(preview(page).locator(".screen")).toContainText("HELLO, WORLD.");
    });

    test("starts a new program of a name that has no file yet", async ({ page }) => {
        await page.goto("./?edit&data=brand-new");
        await expect(page.getByRole("status").first()).toContainText("No brand-new.json yet");
        await expect(preview(page).locator(".screen")).toContainText("HELLO, WORLD.");
    });

    test.describe("screens", () => {
        const screenList = (page: Page) => page.getByRole("navigation", { name: "Screens" });
        const openScreen = async (page: Page, title: RegExp) => {
            await screenList(page).getByRole("button", { name: title }).click();
        };
        const element = (page: Page, number: number) =>
            page.getByRole("button", { name: new RegExp(`^Element ${number}:`) });

        test("edits a screen's elements, with the preview showing it", async ({ page }) => {
            await openEditor(page);
            await screenList(page)
                .getByRole("button", { name: /^Show the screens under HOME/ })
                .click();
            await openScreen(page, /^OTHER/);
            await expect(preview(page).locator(".screen")).toContainText("OTHER SCREEN");

            await element(page, 1).click();
            await page.getByRole("textbox", { name: "Text" }).fill("EDITED SCREEN");
            await expect(preview(page).locator(".screen")).toContainText("EDITED SCREEN");
            await expect(page.getByText("Unsaved")).toBeVisible();
        });

        test("adds, moves, duplicates and deletes elements", async ({ page }) => {
            await openEditor(page);
            await openScreen(page, /^HOME/);
            await page.getByRole("combobox", { name: "Add an element" }).click();
            await page.keyboard.type("rule");
            await page.getByRole("option", { name: /^rule/ }).click();
            await expect(element(page, 3)).toHaveAccessibleName(/rule/);
            await page.getByLabel("label", { exact: true }).fill("NEW RULE");
            await expect(preview(page).locator(".screen")).toContainText("NEW RULE");

            // the rule moves up, between the text and the link
            await element(page, 3).locator("..").getByRole("button", { name: "Move up" }).click();
            await expect(element(page, 2)).toHaveAccessibleName(/rule, NEW RULE/);
            await element(page, 2).locator("..").getByRole("button", { name: "Duplicate" }).click();
            await expect(element(page, 3)).toHaveAccessibleName(/rule, NEW RULE/);
            await element(page, 3).locator("..").getByRole("button", { name: "Delete" }).click();
            await element(page, 2).locator("..").getByRole("button", { name: "Delete" }).click();
            await expect(element(page, 2)).toHaveAccessibleName(/link, > OTHER/);
            await expect(page.getByText("No problems")).toBeVisible();
        });

        test("adds, renames and deletes screens, renaming what links to them", async ({ page }) => {
            await openEditor(page);
            await openScreen(page, /^HOME/);
            await page.getByRole("button", { name: "Add a screen" }).click();
            await expect(page.getByText("new-screen", { exact: true })).toBeVisible();
            await expect(preview(page).locator(".screen")).toContainText("NEW SCREEN");

            await screenList(page)
                .getByRole("button", { name: /^OTHER/ })
                .click();
            await page.getByRole("button", { name: "Rename" }).click();
            await page.getByRole("textbox", { name: "Screen id" }).fill("deck");
            await page.getByRole("button", { name: "Rename" }).click();
            await expect(page.getByText("deck", { exact: true })).toBeVisible();
            await expect(page.getByText("No problems")).toBeVisible();
            // undo follows it back to its old name, and redo forward again
            await page.getByRole("button", { name: "Undo" }).click();
            await expect(page.getByText("other", { exact: true })).toBeVisible();
            await page.getByRole("button", { name: "Redo" }).click();
            await expect(page.getByText("deck", { exact: true })).toBeVisible();
            // HOME's link goes to it by its new name
            await openScreen(page, /^HOME/);
            await element(page, 2).click();
            await page.getByRole("tab", { name: "JSON" }).click();
            await expect(page.getByRole("textbox", { name: "As JSON" })).toHaveValue(
                /"screen": "deck"/,
            );

            await screenList(page).getByRole("button", { name: /^DECK/ }).click();
            page.once("dialog", (dialog) => dialog.accept());
            await page.getByRole("button", { name: "More" }).click();
            await page.getByRole("menuitem", { name: "Delete the screen" }).click();
            // the link to it is now a mistake, which leads back to it: HOME, with the link open
            await page.getByRole("button", { name: "1 problem" }).click();
            await page.getByText('Unknown screen "deck"').click();
            await expect(element(page, 2)).toHaveAttribute("aria-expanded", "true");
            await expect(element(page, 2)).toHaveAccessibleName(/link, > OTHER/);
            await page.getByRole("button", { name: "Undo" }).click();
            await expect(page.getByText("No problems")).toBeVisible();
        });
    });

    test("edits dialogs, renaming what opens them", async ({ page }) => {
        await openEditor(page);
        const dialogList = page.getByRole("navigation", { name: "Dialogs" });
        await dialogList.getByRole("button", { name: "warning" }).click();
        await page.getByRole("button", { name: "Open in the preview" }).click();
        await expect(preview(page).locator("dialog[open]")).toContainText("DANGER AHEAD");

        // another kind keeps its text
        await choose(page, "type", "confirm");
        await expect(page.getByRole("textbox", { name: "content" })).toHaveValue(/DANGER AHEAD/);
        await choose(page, "type", "alert");

        await page.getByRole("button", { name: "Rename" }).click();
        await page.getByRole("textbox", { name: "Dialog id" }).fill("alarm");
        await page.getByRole("button", { name: "Rename" }).click();
        await expect(dialogList.getByRole("button", { name: "alarm" })).toBeVisible();
        await expect(page.getByText("No problems")).toBeVisible();

        await page.getByRole("button", { name: "Add a dialog" }).click();
        await expect(dialogList.getByRole("button", { name: "new-dialog" })).toBeVisible();
    });

    test("edits variables and timers", async ({ page }) => {
        await openEditor(page);
        await section(page, "Variables & timers");
        await page.getByRole("textbox", { name: "Add a variable" }).fill("fuel");
        await page.getByRole("button", { name: "Add a variable" }).click();
        await choose(page, "fuel: kind", "Number");
        await page.getByRole("textbox", { name: "fuel", exact: true }).fill("40");
        await page.getByRole("textbox", { name: "Add a variable" }).fill("fuel");
        await expect(page.getByText('"fuel" is taken')).toBeVisible();
        await page.getByRole("textbox", { name: "Add a variable" }).fill("");

        await page.getByRole("textbox", { name: "Add a timer" }).fill("clock");
        await page.getByRole("button", { name: "Add a timer" }).click();
        await expect(page.getByText("No problems")).toBeVisible();
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.getByRole("button", { name: /^Download/ }).click(),
        ]);
        const config = JSON.parse(await readFile(await download.path(), "utf8")).config;
        expect(config.variables).toEqual({ fuel: 40 });
        expect(config.timers).toEqual({ clock: { from: 60 } });
    });

    test("designs the program's own sounds", async ({ page }) => {
        await openEditor(page);
        await section(page, "Sounds");
        await page.getByRole("textbox", { name: "Add a sound" }).fill("zap");
        await page.getByRole("button", { name: "Add a sound" }).click();
        await page.getByRole("radiogroup", { name: "Wave" }).getByText("Noise").click();
        await page.getByRole("button", { name: "Play", exact: true }).click();
        await page.getByRole("textbox", { name: "Sound name" }).fill("laser");
        await page.getByRole("button", { name: "Rename" }).click();
        await expect(page.getByRole("navigation", { name: "Sounds" })).toContainText("laser");
        await expect(page.getByText("No problems")).toBeVisible();

        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.getByRole("button", { name: /^Download/ }).click(),
        ]);
        const file = JSON.parse(await readFile(await download.path(), "utf8"));
        expect(Object.keys(file.sounds)).toEqual(["laser"]);
        expect(file.sounds.laser.wave).toBe("noise");
    });

    test("tunes Teletronix's own sounds, writing only what changes", async ({ page }) => {
        await openEditor(page);
        await section(page, "Sounds");
        await page.getByRole("tab", { name: "Teletronix's own" }).click();
        const written = async () => {
            const [download] = await Promise.all([
                page.waitForEvent("download"),
                page.getByRole("button", { name: /^Download/ }).click(),
            ]);
            return JSON.parse(await readFile(await download.path(), "utf8")).config.sound;
        };
        await page.getByRole("button", { name: "Play: Select" }).click();
        await choose(page, "Select: Wave", "sine");
        expect(await written()).toEqual({ voices: { select: { wave: "sine" } } });
        await page.getByRole("button", { name: "Reset: Select" }).click();
        expect(await written()).toBeUndefined();
        await page
            .getByRole("textbox", { name: "Type here to hear key clicks" })
            .pressSequentially("ab");
    });

    test("edits text that can be none, e.g. a preset's lines", async ({ page }) => {
        await openEditor(page);
        await page.getByRole("button", { name: "Add a screen" }).click();
        await page.getByRole("button", { name: /Screen settings/ }).click();
        // (boot is the first preset in the list)
        await page.getByRole("combobox", { name: "preset" }).focus();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(page.getByRole("combobox", { name: "preset" })).toHaveValue("boot");
        const options = page.locator(".editor-choice-options");
        await options.getByRole("textbox", { name: "title", exact: true }).fill("MY OS");
        await options.getByRole("switch", { name: "copyright: none" }).click();
        await expect(
            options.getByRole("textbox", { name: "copyright", exact: true }),
        ).toBeDisabled();
        const [download] = await Promise.all([
            page.waitForEvent("download"),
            page.getByRole("button", { name: /^Download/ }).click(),
        ]);
        const file = JSON.parse(await readFile(await download.path(), "utf8"));
        expect(file.screens["new-screen"].preset).toMatchObject({
            type: "boot",
            title: "MY OS",
            copyright: false,
        });
    });
});
