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
        other: { parent: "home", content: ["OTHER SCREEN"] },
    },
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
        expect(text).toContain('"other": { "parent": "home", "content": ["OTHER SCREEN"] }');
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
});
