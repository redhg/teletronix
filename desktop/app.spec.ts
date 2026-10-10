import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron, type ElectronApplication, expect, test } from "@playwright/test";
import { openPackage } from "../scripts/ttx.ts";
import { writeZip } from "../scripts/zip.ts";

// The desktop app, started from the repository (after a build): a program opened from a file,
// its menus, the GM panel, saving, and opening where it left off.

let folder = "";
let program = "";
const apps: ElectronApplication[] = [];

/** Starts the app, remembering what it remembers in the test's folder. */
async function start(...args: string[]) {
    // (not as plain Node, which some editors' terminals ask for)
    const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
    const app = await _electron.launch({
        args: [".", ...args, `--user-data=${join(folder, "user-data")}`],
        env: env as Record<string, string>,
    });
    apps.push(app);
    return app;
}

/** A menu's items' labels, e.g. ["File", "Open Recent"]. */
const menuLabels = (app: ElectronApplication, path: string[]) =>
    app.evaluate(({ Menu }, path) => {
        let items = Menu.getApplicationMenu()?.items;
        for (const label of path)
            items = items?.find((item) => item.label === label)?.submenu?.items;
        return items?.map((item) => item.label);
    }, path);

const clickMenu = (app: ElectronApplication, path: string[]) =>
    app.evaluate(({ Menu }, path) => {
        let items = Menu.getApplicationMenu()?.items;
        for (const [i, label] of path.entries()) {
            const item = items?.find((candidate) => candidate.label === label);
            if (i === path.length - 1) item?.click();
            items = item?.submenu?.items;
        }
    }, path);

test.beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "teletronix-app-"));
    await mkdir(join(folder, "heist", "images"), { recursive: true });
    program = join(folder, "heist", "The Heist.json");
    await writeFile(
        program,
        JSON.stringify({
            config: { name: "Heist", reveal: "instant" },
            screens: {
                home: {
                    content: [
                        "THE VAULT IS OPEN.",
                        { type: "bitmap", src: "data/images/vault.svg", alt: "VAULT" },
                    ],
                },
            },
        }),
    );
    await writeFile(
        join(folder, "heist", "images", "vault.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>',
    );
});

test.afterEach(async () => {
    for (const app of apps.splice(0)) await app.close().catch(() => {});
    await rm(folder, { recursive: true, force: true });
});

test("plays a program opened from a file, with its files beside it", async () => {
    const app = await start(program);
    const window = await app.firstWindow();
    await expect(window.locator(".screen")).toContainText("THE VAULT IS OPEN.");
    await expect(window).toHaveURL(/^http:\/\/localhost:\d+\/\?data=The-Heist$/);
    // (its image, from beside it)
    await expect(window.locator(".bitmap canvas")).toBeVisible();

    expect(await menuLabels(app, ["File", "Open Recent"])).toEqual([program, "", "Clear Menu"]);
    expect(await menuLabels(app, ["File", "Built-in Programs"])).toContain("Tape 7");

    const panel = app.waitForEvent("window");
    await clickMenu(app, ["Window", "GM Panel"]);
    const gm = await panel;
    await expect(gm).toHaveURL(/\?data=The-Heist&gm$/);
    await expect(gm.getByText("LIVE")).toBeVisible();
});

test("saves the editor's changes into the file", async () => {
    const app = await start(program);
    const window = await app.firstWindow();
    await expect(window.locator(".screen")).toContainText("THE VAULT IS OPEN.");
    const saved = await window.evaluate(async () => {
        const can = await fetch("__teletronix/save");
        const put = await fetch("__teletronix/save/The-Heist.json", {
            method: "PUT",
            body: JSON.stringify({ config: { name: "Heist, edited" }, screens: {} }),
        });
        return [can.status, put.status, put.headers.get("X-Saved-To")];
    });
    expect(saved).toEqual([204, 204, program]);
    expect(JSON.parse(await readFile(program, "utf8")).config.name).toBe("Heist, edited");
});

test("opens where it left off: the program from its file", async () => {
    const first = await start(program);
    await expect((await first.firstWindow()).locator(".screen")).toContainText("THE VAULT");
    await first.close();

    const again = await start();
    const window = await again.firstWindow();
    await expect(window.locator(".screen")).toContainText("THE VAULT IS OPEN.");
    expect(await menuLabels(again, ["File", "Open Recent"])).toContain(program);
});

test("plays a package (.ttx), straight from it", async () => {
    const ttx = join(folder, "Heist.ttx");
    await writeZip(ttx, [
        { name: "heist.json", data: await readFile(program), compress: true },
        {
            name: "images/vault.svg",
            data: await readFile(join(folder, "heist", "images", "vault.svg")),
            compress: true,
        },
    ]);
    const app = await start(ttx);
    const window = await app.firstWindow();
    await expect(window.locator(".screen")).toContainText("THE VAULT IS OPEN.");
    await expect(window).toHaveURL(/\?data=Heist$/);
    await expect(window.locator(".bitmap canvas")).toBeVisible();
    // (it's only for playing: the editor would download)
    expect(await window.evaluate(async () => (await fetch("__teletronix/save")).status)).toBe(404);
});

test("exports the program, with its files, as a package", async () => {
    const app = await start(program);
    const window = await app.firstWindow();
    await expect(window.locator(".screen")).toContainText("THE VAULT IS OPEN.");
    const out = join(folder, "exported.ttx");
    // (the save dialog, answered; the message, and showing it in the Finder, skipped)
    await app.evaluate(({ dialog, shell }, out) => {
        dialog.showSaveDialog = (async () => ({ canceled: false, filePath: out })) as never;
        dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as never;
        shell.showItemInFolder = () => {};
    }, out);
    await window.focus("body");
    await clickMenu(app, ["File", "Export as Package…"]);
    await expect
        .poll(() =>
            readFile(out).then(
                () => true,
                () => false,
            ),
        )
        .toBe(true);
    const opened = await openPackage(out);
    expect(opened.program.name).toBe("The-Heist.json");
    expect(opened.files()).toEqual(["images/vault.svg"]);
    await opened.reader.close();
});
