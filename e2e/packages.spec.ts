import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "./fixtures.ts";

// Packages (.ttx) in the browser: opened (chosen, or dropped on the page), kept for a reload
// and the GM's panel, and played with their files.

let folder = "";
let ttx = "";

const PROGRAM = {
    config: { name: "Heist", start: "home", reveal: "instant" },
    screens: {
        home: {
            content: [
                "THE VAULT IS OPEN.",
                { type: "bitmap", src: "data/images/vault.svg", alt: "VAULT", cols: 10 },
            ],
        },
    },
};

test.beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), "teletronix-packages-"));
    await mkdir(join(folder, "images"));
    await writeFile(join(folder, "heist.json"), JSON.stringify(PROGRAM));
    await writeFile(
        join(folder, "images", "vault.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#0f0"/></svg>',
    );
    ttx = join(folder, "The Heist.ttx");
    // (made as anyone would: with the script)
    execFileSync("node", ["scripts/package.ts", join(folder, "heist.json"), ttx]);
});

test.afterAll(async () => {
    await rm(folder, { recursive: true, force: true });
});

/**
 * Opens the package with Cmd/Ctrl+O, as a player would, from a program's page; again if the
 * page wasn't listening yet (it starts listening once the player's code has loaded).
 */
async function choose(page: Page, file = ttx) {
    await expect(async () => {
        const chooser = page.waitForEvent("filechooser", { timeout: 2000 });
        await page.keyboard.press("ControlOrMeta+o");
        await (await chooser).setFiles(file);
    }).toPass({ timeout: 15_000 });
}

/** Drops a file on the page, as dragging one from the desktop does. */
async function drop(page: Page, file: string, name: string) {
    const bytes = [...(await readFile(file))];
    await page.evaluate(
        ({ bytes, name }) => {
            const transfer = new DataTransfer();
            transfer.items.add(new File([new Uint8Array(bytes)], name));
            for (const type of ["dragenter", "dragover", "drop"]) {
                document.body.dispatchEvent(
                    new DragEvent(type, {
                        dataTransfer: transfer,
                        bubbles: true,
                        cancelable: true,
                    }),
                );
            }
        },
        { bytes, name },
    );
}

test.describe("a package", () => {
    test("plays when it's chosen, with its files, and again after a reload", async ({
        page,
        player,
    }) => {
        await player.open("sample", "#home");
        await choose(page);
        await expect(page).toHaveURL(/\?data=ttx:The-Heist$/);
        await expect(player.screen).toContainText("THE VAULT IS OPEN.");
        await expect(player.screen.locator(".bitmap canvas")).toBeVisible();
        await expect(page).toHaveTitle("Heist");

        await page.reload();
        await expect(player.screen).toContainText("THE VAULT IS OPEN.");
        await expect(player.screen.locator(".bitmap canvas")).toBeVisible();
    });

    test("plays when it's dropped on the page, which shows where while one's dragged", async ({
        page,
        player,
    }) => {
        await player.open("sample", "#home");
        await page.evaluate(() => {
            const transfer = new DataTransfer();
            transfer.items.add(new File(["x"], "anything.ttx"));
            document.body.dispatchEvent(
                new DragEvent("dragenter", { dataTransfer: transfer, bubbles: true }),
            );
        });
        await expect(page.locator(".package-drop")).toContainText("DROP A TELETRONIX PACKAGE");
        await drop(page, ttx, "The Heist.ttx");
        await expect(page).toHaveURL(/\?data=ttx:The-Heist$/);
        await expect(player.screen).toContainText("THE VAULT IS OPEN.");
    });

    test("says so, for a file that isn't one", async ({ page, player }) => {
        await player.open("sample", "#home");
        await drop(page, join(folder, "heist.json"), "heist.json");
        await expect(page.locator(".package-drop.alert")).toContainText(
            "CAN'T OPEN IT: heist.json isn't a package",
        );
        const fake = join(folder, "fake.ttx");
        await writeFile(fake, "not a zip");
        await choose(page, fake);
        await expect(page.locator(".package-drop.alert")).toContainText("Not a zip archive");
        await expect(page).toHaveURL(/\?data=sample/);
    });

    test("can be chosen where it isn't yet, e.g. a device the GM's QR code opened", async ({
        page,
    }) => {
        await page.goto("./?data=ttx:The-Heist");
        const error = page.locator(".error-view");
        await expect(error).toContainText(`The package "The-Heist" isn't in this browser`);
        const chooser = page.waitForEvent("filechooser");
        await error.getByRole("button", { name: "> CHOOSE THE PACKAGE…" }).click();
        await (await chooser).setFiles(ttx);
        await expect(page.locator(".screen")).toContainText("THE VAULT IS OPEN.");
    });

    test("works with the GM's panel: its handouts, from the package", async ({ page, player }) => {
        await player.open("sample", "#home");
        await choose(page);
        await expect(player.screen).toContainText("THE VAULT IS OPEN.");

        const gm = await page.context().newPage();
        await gm.goto("./?data=ttx:The-Heist&gm");
        await expect(gm.getByText("LIVE")).toBeVisible();
        await gm.getByRole("tab", { name: "Media" }).click();
        const handout = gm.getByRole("button", { name: /vault\.svg/ });
        await handout.click();
        // (the players' window shows it from its copy of the package; the panel knows it's on)
        const viewer = page.getByRole("dialog", { name: "Image" });
        await expect(viewer.locator("img")).toHaveAttribute("src", /^blob:/);
        await expect(handout).toHaveAttribute("aria-current", "true");
    });

    test("opens in the editor, whose preview has its files too", async ({ page, player }) => {
        await player.open("sample", "#home");
        await choose(page);
        await expect(player.screen).toContainText("THE VAULT IS OPEN.");
        await page.goto("./?edit&data=ttx:The-Heist");
        const preview = page.frameLocator("iframe.editor-preview");
        await expect(preview.locator(".screen")).toContainText("THE VAULT IS OPEN.");
        await expect(preview.locator(".bitmap canvas")).toBeVisible();
        await expect(preview.locator(".bitmap")).not.toContainText("UNAVAILABLE");
    });

    test("keeps the latest ten opened in this browser", async ({ page, player }) => {
        test.slow();
        await player.open("sample", "#home");
        for (let i = 1; i <= 11; i++) {
            const copy = join(folder, `heist-${i}.ttx`);
            await copyFile(ttx, copy);
            await choose(page, copy);
            // (loaded, not just addressed: every one shows the same text, and the next key
            // press mustn't land on the page that's going)
            await page.waitForURL(new RegExp(`data=ttx:heist-${i}$`));
            await expect(player.screen).toContainText("THE VAULT IS OPEN.");
        }
        const kept = await page.evaluate(
            () =>
                new Promise<string[]>((resolve) => {
                    const open = indexedDB.open("teletronix-packages");
                    open.onsuccess = () => {
                        const keys = open.result
                            .transaction("packages")
                            .objectStore("packages")
                            .getAllKeys();
                        keys.onsuccess = () => resolve((keys.result as string[]).sort());
                    };
                }),
        );
        expect(kept).toHaveLength(10);
        expect(kept).not.toContain("heist-1");
        expect(kept).toContain("heist-11");
    });
});
