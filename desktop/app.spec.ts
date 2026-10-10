import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron, type ElectronApplication, expect, test } from "@playwright/test";

// The desktop app, started from the repository (after a build): its window, its menus, the GM
// panel, and the player's own programs.

let folder = "";
let app: ElectronApplication;

test.beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), "teletronix-app-"));
    await writeFile(
        join(folder, "heist.json"),
        JSON.stringify({
            config: { name: "Heist", reveal: "instant" },
            screens: { home: { content: ["THE VAULT IS OPEN."] } },
        }),
    );
    // (not as plain Node, which some editors' terminals ask for)
    const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
    app = await _electron.launch({
        args: [
            ".",
            "--program=heist",
            `--programs=${folder}`,
            `--user-data=${join(folder, "user-data")}`,
        ],
        env: env as Record<string, string>,
    });
});

test.afterEach(async () => {
    await app?.close();
    await rm(folder, { recursive: true, force: true });
});

test("plays a program of the player's own, lists it, and opens the GM panel", async () => {
    const window = await app.firstWindow();
    await expect(window.locator(".screen")).toContainText("THE VAULT IS OPEN.");
    expect(window.url()).toMatch(/^http:\/\/localhost:\d+\/\?data=heist$/);

    const programs = await app.evaluate(({ Menu }) =>
        Menu.getApplicationMenu()
            ?.items.find((item) => item.label === "File")
            ?.submenu?.items.find((item) => item.label === "Programs")
            ?.submenu?.items.map((item) => item.label),
    );
    expect(programs?.slice(0, 2)).toEqual(["Your Programs", "Heist"]);
    expect(programs).toContain("Tape 7");

    const panel = app.waitForEvent("window");
    await app.evaluate(({ Menu }) =>
        Menu.getApplicationMenu()
            ?.items.find((item) => item.label === "Window")
            ?.submenu?.items.find((item) => item.label === "GM Panel")
            ?.click(),
    );
    const gm = await panel;
    await expect(gm).toHaveURL(/\?data=heist&gm$/);
    await expect(gm.getByText("LIVE")).toBeVisible();
});
