import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "@playwright/test";
import { expect, type Page, test } from "./fixtures.ts";

// The start page: an address without a program. Join a GM's session, open a package, play
// one opened before, or try a demo.

let folder = "";
let ttx = "";

test.beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), "teletronix-start-"));
    ttx = join(folder, "Tape 7.ttx");
    execFileSync("node", ["scripts/package.ts", "public/data/tape7.json", ttx]);
});

test.afterAll(async () => {
    await rm(folder, { recursive: true, force: true });
});

const start = (page: Page) => page.locator(".start-page");

/**
 * A GM, in a browser of its own (or one given, e.g. with a package in it), playing a program,
 * with a session started.
 */
async function gmPlaying(
    from: Browser | Page,
    program: string,
): Promise<{ gm: Page; code: string }> {
    const gm =
        "newContext" in from
            ? await (await from.newContext()).newPage()
            : await from.context().newPage();
    await gm.goto(`./?data=${program}&gm`);
    await gm.getByRole("button", { name: "Start a session" }).click();
    await expect(gm.locator(".gm-pairing")).toContainText("Connected");
    return { gm, code: (await gm.locator(".gm-pairing strong").innerText()).trim() };
}

test("is what an address without a program shows: sessions, packages and demos", async ({
    page,
}) => {
    await page.goto("./");
    await expect(start(page)).toContainText("JOIN A GM'S SESSION");
    await expect(page).toHaveTitle("Teletronix");
    const demo = start(page).getByRole("link", { name: "> TAPE 7" });
    await expect(demo).toHaveAttribute("href", "?data=tape7");
    await expect(start(page).getByRole("link", { name: "GM panel for TAPE 7" })).toHaveAttribute(
        "href",
        "?data=tape7&gm",
    );
    await expect(start(page).getByRole("link", { name: "WHICH VERSION?" })).toBeVisible();
    await demo.click();
    await expect(page.locator(".screen")).toContainText("KEPLER RELAY STATION");
});

test("opens a package, and lists it after, to play again or run as the GM", async ({ page }) => {
    await page.goto("./");
    const chooser = page.waitForEvent("filechooser");
    await start(page).getByRole("button", { name: "> OPEN A PACKAGE (.TTX)…" }).click();
    await (await chooser).setFiles(ttx);
    await page.waitForURL(/\?data=ttx:[0-9a-z]{11}$/);
    const id = new URL(page.url()).searchParams.get("data");
    // (playing, its files loaded: leaving while they load, WebKit says so, as an error)
    await expect(page.locator(".screen")).toContainText("KEPLER RELAY STATION");

    await page.goto("./");
    const opened = start(page).getByRole("list", { name: "Opened here" });
    await expect(opened.getByRole("link", { name: "> TAPE 7" })).toHaveAttribute(
        "href",
        `?data=${id}`,
    );
    await expect(opened.getByRole("link", { name: "GM panel for Tape 7" })).toHaveAttribute(
        "href",
        `?data=${id}&gm`,
    );
    await expect(opened).toContainText("TODAY");
});

test("joins a GM's session by its code alone, at the program the GM's playing", async ({
    page,
    browser,
}) => {
    const { gm, code } = await gmPlaying(browser, "tape7");
    await page.goto("./");
    await start(page).getByRole("textbox", { name: "Session code" }).fill(code.toLowerCase());
    await start(page).getByRole("button", { name: "> JOIN" }).click();
    await page.waitForURL(new RegExp(`\\?data=tape7&join=${code}$`));
    await expect(page.locator(".remote-badge")).toContainText(`SESSION ${code} · GM CONNECTED`);
    await gm.context().close();
});

test("joins a GM playing a package it hasn't got: the GM's offer, then by no name", async ({
    page,
    browser,
}) => {
    // (the GM's browser has the package, and plays it)
    const gmPage = await (await browser.newContext()).newPage();
    await gmPage.goto("./");
    const chooser = gmPage.waitForEvent("filechooser");
    await gmPage.getByRole("button", { name: "> OPEN A PACKAGE (.TTX)…" }).click();
    await (await chooser).setFiles(ttx);
    await gmPage.waitForURL(/\?data=ttx:/);
    const program = new URL(gmPage.url()).searchParams.get("data") ?? "";
    const { gm, code } = await gmPlaying(gmPage, program);

    await page.goto("./");
    await start(page).getByRole("textbox", { name: "Session code" }).fill(code);
    await start(page).getByRole("button", { name: "> JOIN" }).click();
    const receive = page.locator(".receive-package");
    await receive.getByRole("button", { name: "> ACCEPT" }).click();
    await expect(page.locator(".screen")).toContainText("KEPLER RELAY STATION", {
        timeout: 30_000,
    });

    // listed, but not by its name: it could give something away
    await page.goto("./");
    const opened = start(page).getByRole("list", { name: "Opened here" });
    await expect(opened).toContainText("PROGRAM DATA FROM A SESSION");
    await expect(opened).not.toContainText(/tape/i);
    await expect(opened.getByRole("link", { name: /GM panel/ })).toHaveCount(0);
    await gm.context().close();
});

test("says so when there's no such session", async ({ page }) => {
    await page.goto("./");
    await start(page).getByRole("textbox", { name: "Session code" }).fill("ZZZZ-0000");
    await start(page).getByRole("button", { name: "> JOIN" }).click();
    await expect(start(page)).toContainText("WAITING FOR THE GM, IN SESSION ZZZZ-0000…");
});
