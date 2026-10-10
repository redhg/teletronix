import { watch } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    app,
    BrowserWindow,
    dialog,
    Menu,
    type MenuItemConstructorOptions,
    nativeImage,
    shell,
} from "electron";
import { listPrograms } from "./programs.ts";
import { startAppServer } from "./server.ts";

// Teletronix as a desktop app: a window on its own server (see server.ts), which also serves
// other devices on the network, for a GM's panel to pair with, as `npm run table` does.
//
//   --kiosk              open the program full screen, as ?kiosk does
//   --program=<name>     open that program (otherwise, the last one played)
//   --programs=<folder>  the player's programs folder (otherwise, Documents/Teletronix)
//   --user-data=<folder> where it keeps what it remembers (otherwise, the system's place)

const BACKGROUND = "#000c0c";
const DOCS = "https://github.com/redhg/teletronix#documentation";

// (its name in the menus, rather than the npm package's, when run from the repository)
app.setName("Teletronix");

const root = app.getAppPath();
const appFolder = join(root, "dist");
const argument = (name: string) =>
    process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const kiosk = process.argv.includes("--kiosk");

// (elsewhere, for tests: what the browser keeps, and the programs folder)
const userData = argument("user-data");
if (userData) app.setPath("userData", userData);
const programsFolder = argument("programs") ?? join(app.getPath("documents"), "Teletronix");
const stateFile = join(app.getPath("userData"), "state.json");

let origin = "";
/** The last program played, as its address's query, e.g. "?data=tape7" */
let lastProgram = "";

// ─── what's remembered between runs ──────────────────────────────────────────

async function loadState() {
    try {
        const state = JSON.parse(await readFile(stateFile, "utf8")) as { last?: unknown };
        if (typeof state.last === "string") lastProgram = state.last;
    } catch {
        // first run
    }
}

function remember(url: string) {
    const address = new URL(url);
    if (address.origin !== origin) return;
    // (a players' window's program, not the GM's panel or the editor)
    if (address.searchParams.has("gm") || address.searchParams.has("edit")) return;
    if (!address.searchParams.has("data") || address.search === lastProgram) return;
    lastProgram = address.search;
    writeFile(stateFile, JSON.stringify({ last: lastProgram })).catch(() => {});
}

// ─── the player's programs folder ────────────────────────────────────────────

const README = `Teletronix programs
===================

Programs here can be played from the Teletronix app's Programs menu, and saved here from
its editor. A program here wins over a built-in one of the same name.

    my-program.json        a program (?data=my-program)
    images/map.png         its files, named in it as "data/images/map.png"
    audio/drone.mp3        "data/audio/drone.mp3"

See ${DOCS}
`;

async function prepareProgramsFolder() {
    await mkdir(programsFolder, { recursive: true });
    await writeFile(join(programsFolder, "README.txt"), README, { flag: "wx" }).catch(() => {});
}

// ─── windows ─────────────────────────────────────────────────────────────────

/** The query of the program in the focused window (or the last one played). */
function currentProgram(): URLSearchParams {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const url = window?.webContents.getURL();
    const params = new URLSearchParams(url ? new URL(url).search : lastProgram);
    for (const option of ["gm", "edit", "kiosk", "remote"]) params.delete(option);
    return params;
}

/** A query with a flag added, e.g. "?data=tape7&gm" (Teletronix's flags have no "="). */
const withFlag = (params: URLSearchParams, flag: string) => {
    const query = params.toString();
    return `?${query ? `${query}&` : ""}${flag}`;
};

function openWindow(search: string, options: { kiosk?: boolean } = {}) {
    const window = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 480,
        minHeight: 320,
        backgroundColor: BACKGROUND,
        title: "Teletronix",
        autoHideMenuBar: true,
        kiosk: options.kiosk,
        show: false,
    });
    window.once("ready-to-show", () => window.show());
    const { webContents } = window;
    // links to elsewhere open in the browser; Teletronix's own (e.g. the panel's "open a
    // players' window") in a window of the app
    webContents.setWindowOpenHandler(({ url }) => {
        if (new URL(url).origin === origin) {
            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    backgroundColor: BACKGROUND,
                    autoHideMenuBar: true,
                },
            };
        }
        void shell.openExternal(url);
        return { action: "deny" };
    });
    webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== origin) {
            event.preventDefault();
            void shell.openExternal(url);
        }
    });
    webContents.on("did-navigate", (_event, url) => remember(url));
    webContents.on("did-navigate-in-page", (_event, url) => remember(url));
    void window.loadURL(`${origin}/${search}`);
    return window;
}

// ─── the menu ────────────────────────────────────────────────────────────────

async function buildMenu() {
    const programs = await listPrograms(join(appFolder, "data"), programsFolder);
    const open = (name: string) => () => {
        const window = BrowserWindow.getFocusedWindow();
        const search = `?data=${encodeURIComponent(name)}`;
        if (window) void window.loadURL(`${origin}/${search}`);
        else openWindow(search);
    };
    const mine = programs.filter((program) => program.own);
    const builtIn = programs.filter((program) => !program.own);
    const programItems: MenuItemConstructorOptions[] = [
        ...(mine.length
            ? [
                  { label: "Your Programs", enabled: false },
                  ...mine.map((p) => ({ label: p.title, click: open(p.name) })),
                  { type: "separator" as const },
              ]
            : []),
        { label: "Built In", enabled: false },
        ...builtIn.map((p) => ({ label: p.title, click: open(p.name) })),
    ];
    const isMac = process.platform === "darwin";
    const template: MenuItemConstructorOptions[] = [
        ...(isMac ? [{ role: "appMenu" as const }] : []),
        {
            label: "File",
            submenu: [
                { label: "Programs", submenu: programItems },
                {
                    label: "Open Programs Folder",
                    click: () => void shell.openPath(programsFolder),
                },
                { type: "separator" },
                {
                    label: "Edit This Program",
                    accelerator: "CmdOrCtrl+E",
                    click: () => openWindow(withFlag(currentProgram(), "edit")),
                },
                { type: "separator" },
                isMac ? { role: "close" } : { role: "quit" },
            ],
        },
        { role: "editMenu" },
        {
            label: "View",
            submenu: [
                { role: "reload" },
                { role: "togglefullscreen" },
                { type: "separator" },
                { role: "toggleDevTools" },
            ],
        },
        {
            label: "Window",
            submenu: [
                {
                    label: "GM Panel",
                    accelerator: "CmdOrCtrl+Shift+G",
                    click: () => openWindow(withFlag(currentProgram(), "gm")),
                },
                {
                    label: "New Players' Window",
                    accelerator: "CmdOrCtrl+N",
                    click: () => openWindow(`?${currentProgram().toString()}`),
                },
                { type: "separator" },
                { role: "minimize" },
                ...(isMac ? [{ role: "front" as const }] : []),
            ],
        },
        {
            role: "help",
            submenu: [
                { label: "Documentation", click: () => void shell.openExternal(DOCS) },
                {
                    label: "Teletronix Online",
                    click: () => void shell.openExternal("https://redhg.github.io/teletronix/"),
                },
            ],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── starting up ─────────────────────────────────────────────────────────────

// one app at a time: opening it again brings the window forward
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window?.isMinimized()) window.restore();
        window?.focus();
    });
    app.on("window-all-closed", () => app.quit());
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) openWindow(lastProgram);
    });

    void app.whenReady().then(async () => {
        try {
            await Promise.all([loadState(), prepareProgramsFolder()]);
            const { port } = await startAppServer({ app: appFolder, programs: programsFolder });
            origin = `http://localhost:${port}`;
        } catch (error) {
            dialog.showErrorBox("Teletronix couldn't start", String(error));
            app.quit();
            return;
        }
        if (process.platform === "darwin" && !app.isPackaged) {
            app.dock?.setIcon(nativeImage.createFromPath(join(appFolder, "icons/icon-512.png")));
        }
        await buildMenu();
        // the menu follows the programs folder
        let pending: ReturnType<typeof setTimeout> | undefined;
        watch(programsFolder, () => {
            clearTimeout(pending);
            pending = setTimeout(() => void buildMenu(), 300);
        });

        const program = argument("program");
        const params = new URLSearchParams(program ? `?data=${program}` : lastProgram);
        params.delete("kiosk");
        const search = kiosk ? withFlag(params, "kiosk") : params.size ? `?${params}` : "";
        openWindow(search, { kiosk });
    });
}
