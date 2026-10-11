import { readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, normalize, resolve, sep } from "node:path";
import {
    app,
    BrowserWindow,
    dialog,
    Menu,
    type MenuItemConstructorOptions,
    nativeImage,
    shell,
} from "electron";
import { makePackage } from "../scripts/ttx.ts";
import { listPrograms } from "./programs.ts";
import { startAppServer } from "./server.ts";
import { type OpenProgram, openProgram } from "./sources.ts";

// Teletronix as a desktop app: a window on its own server (see server.ts), which also serves
// other devices on the network, for a GM's panel to pair with, as `npm run table` does.
//
// A program can be one of the built-in ones, or opened from a file anywhere (File → Open
// Program…, a file dropped on its icon, or one named when it starts): its folder is served as
// data/, so its images and sounds go beside it as public/data has them.
//
//   <file>.json          open that program
//   --program=<name>     open that built-in program (otherwise, the last one played)
//   --kiosk              open it full screen, as ?kiosk does
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

// (elsewhere, for tests)
const userData = argument("user-data");
if (userData) app.setPath("userData", userData);
const stateFile = join(app.getPath("userData"), "state.json");

/** How many programs Open Recent keeps. */
const RECENT = 10;

let origin = "";
/** The program opened from a file, if one is (the server serves it) */
let opened: OpenProgram | null = null;

/** What's remembered between runs */
const state: {
    /** The last program played, as its address's query, e.g. "?data=tape7" */
    last: string;
    /** Its file, if it was opened from one */
    file?: string;
    /** Programs opened from files, the latest first */
    recent: string[];
} = { last: "", recent: [] };

// ─── what's remembered between runs ──────────────────────────────────────────

async function loadState() {
    try {
        const saved = JSON.parse(await readFile(stateFile, "utf8")) as Record<string, unknown>;
        if (typeof saved.last === "string") state.last = saved.last;
        if (typeof saved.file === "string") state.file = saved.file;
        if (Array.isArray(saved.recent)) {
            state.recent = saved.recent.filter((file) => typeof file === "string");
        }
    } catch {
        // first run
    }
}

const saveState = () => void writeFile(stateFile, JSON.stringify(state)).catch(() => {});

function remember(url: string) {
    const address = new URL(url);
    if (address.origin !== origin) return;
    // (a players' window's program, not the GM's panel or the editor)
    if (address.searchParams.has("gm") || address.searchParams.has("edit")) return;
    const name = address.searchParams.get("data");
    if (name === null || address.search === state.last) return;
    state.last = address.search;
    state.file = opened && name === opened.name ? opened.file : undefined;
    saveState();
}

// ─── programs from files ─────────────────────────────────────────────────────

/**
 * Opens a program from its file, in the focused window (or a new one): the server serves it,
 * and its folder as data/. It's added to Open Recent.
 */
async function openProgramFile(file: string) {
    const path = resolve(file);
    let program: OpenProgram;
    try {
        program = await openProgram(path);
    } catch (error) {
        dialog.showErrorBox(
            `Couldn't open ${basename(path)}`,
            error instanceof Error ? error.message : String(error),
        );
        return;
    }
    void opened?.close();
    opened = program;
    state.recent = [path, ...state.recent.filter((other) => other !== path)].slice(0, RECENT);
    saveState();
    app.addRecentDocument(path);
    void buildMenu();
    showProgram(`?data=${opened.name}`);
}

/** Shows a program in the focused players' window, or a new one. */
function showProgram(search: string) {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!window) {
        openWindow(search);
        return;
    }
    // (keeping a kiosk window a kiosk)
    const kioskWindow = new URL(window.webContents.getURL() || origin).searchParams.has("kiosk");
    void window.loadURL(`${origin}/${kioskWindow ? `${search}&kiosk` : search}`);
}

async function chooseProgramFile() {
    const window = BrowserWindow.getFocusedWindow();
    const options: Electron.OpenDialogOptions = {
        title: "Open a Teletronix program",
        properties: ["openFile"],
        filters: [{ name: "Teletronix programs", extensions: ["json", "ttx", "zip"] }],
    };
    const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
    const file = result.filePaths[0];
    if (!result.canceled && file) await openProgramFile(file);
}

/** The program files (and packages) among a command line's arguments (or a second launch's). */
const filesIn = (args: string[]) =>
    args.filter((arg) => !arg.startsWith("-") && /\.(json|ttx|zip)$/i.test(arg));

/** A file the program in the focused window names ("data/…"): its own, or a built-in one. */
async function programFile(path: string): Promise<Buffer | null> {
    const own = opened && (await opened.find(path.slice("data/".length)));
    if (own) {
        const chunks: Buffer[] = [];
        for await (const chunk of await own.stream()) chunks.push(chunk as Buffer);
        return Buffer.concat(chunks);
    }
    const folder = join(appFolder, "data");
    const file = normalize(join(folder, path.slice("data/".length)));
    return file.startsWith(folder + sep) ? readFile(file).catch(() => null) : null;
}

/**
 * Makes a package (.ttx) of the program in the focused window, with every file it names, to
 * hand to someone: its own, or a built-in one.
 */
async function exportPackage() {
    const name = currentProgram().get("data") ?? "sample";
    const text = (await programFile(`data/${name}.json`))?.toString("utf8");
    if (!text) {
        dialog.showErrorBox("Nothing to export", "Open a program first.");
        return;
    }
    const window = BrowserWindow.getFocusedWindow();
    const options: Electron.SaveDialogOptions = {
        title: "Export as a Teletronix package",
        defaultPath: join(app.getPath("documents"), `${name}.ttx`),
        filters: [{ name: "Teletronix packages", extensions: ["ttx"] }],
    };
    const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return;
    try {
        const { files, missing } = await makePackage({ name, text }, programFile, result.filePath);
        const detail = `${basename(result.filePath)}: the program, and ${files.length} file${files.length === 1 ? "" : "s"}.`;
        await dialog.showMessageBox({
            type: missing.length ? "warning" : "info",
            message: missing.length ? "Exported, without some files" : "Exported",
            detail: missing.length
                ? `${detail}\n\nThese weren't found, so they're left out:\n${missing.join("\n")}`
                : detail,
        });
        shell.showItemInFolder(result.filePath);
    } catch (error) {
        dialog.showErrorBox("Couldn't export it", String(error));
    }
}

/** "~/Games/heist.json", for the menu. */
const shortPath = (file: string) =>
    file.startsWith(homedir()) ? `~${file.slice(homedir().length)}` : file;

// ─── windows ─────────────────────────────────────────────────────────────────

/** The query of the program in the focused window (or the last one played). */
function currentProgram(): URLSearchParams {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const url = window?.webContents.getURL();
    const params = new URLSearchParams(url ? new URL(url).search : state.last);
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
    const builtIn = await listPrograms(join(appFolder, "data"));
    const isMac = process.platform === "darwin";
    const template: MenuItemConstructorOptions[] = [
        ...(isMac ? [{ role: "appMenu" as const }] : []),
        {
            label: "File",
            submenu: [
                {
                    label: "Open Program…",
                    accelerator: "CmdOrCtrl+O",
                    click: () => void chooseProgramFile(),
                },
                {
                    label: "Open Recent",
                    submenu: [
                        ...state.recent.map((file) => ({
                            label: shortPath(file),
                            click: () => void openProgramFile(file),
                        })),
                        ...(state.recent.length ? [{ type: "separator" as const }] : []),
                        {
                            label: "Clear Menu",
                            enabled: state.recent.length > 0,
                            click: () => {
                                state.recent = [];
                                saveState();
                                app.clearRecentDocuments();
                                void buildMenu();
                            },
                        },
                    ],
                },
                {
                    label: "Built-in Programs",
                    submenu: builtIn.map((program) => ({
                        label: program.title,
                        click: () => showProgram(`?data=${encodeURIComponent(program.name)}`),
                    })),
                },
                { type: "separator" },
                {
                    label: "Export as Package…",
                    click: () => void exportPackage(),
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
                    click: () => void shell.openExternal("https://teletronix.net/"),
                },
            ],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── starting up ─────────────────────────────────────────────────────────────

// a file dropped on the app's icon, or opened with it (macOS), even before it's ready
let pendingFile: string | undefined = filesIn(process.argv.slice(1))[0];
app.on("open-file", (event, file) => {
    event.preventDefault();
    if (origin) void openProgramFile(file);
    else pendingFile = file;
});

// one app at a time: opening it again brings the window forward (with a file, opening it)
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", (_event, args) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window?.isMinimized()) window.restore();
        window?.focus();
        const file = filesIn(args.slice(1))[0];
        if (file) void openProgramFile(file);
    });
    app.on("window-all-closed", () => app.quit());
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) openWindow(state.last);
    });

    void app.whenReady().then(async () => {
        try {
            await loadState();
            const { port } = await startAppServer({ app: appFolder, open: () => opened });
            origin = `http://localhost:${port}`;
        } catch (error) {
            dialog.showErrorBox("Teletronix couldn't start", String(error));
            app.quit();
            return;
        }
        // (its About box: the version and commit of the Teletronix it serves)
        try {
            const build = JSON.parse(await readFile(join(appFolder, "version.json"), "utf8")) as {
                version: string;
                commit: string;
            };
            app.setAboutPanelOptions({
                applicationName: "Teletronix",
                applicationVersion: build.version,
                version: build.commit,
                website: "https://teletronix.net/",
            });
        } catch {
            // (a build without one: Electron's own)
        }
        if (process.platform === "darwin" && !app.isPackaged) {
            app.dock?.setIcon(nativeImage.createFromPath(join(appFolder, "icons/icon-512.png")));
        }
        await buildMenu();

        // the program to start with: a file it was given, a built-in one it was told, or the
        // last one played (from its file, if it's still there)
        const program = argument("program");
        const lastFile =
            !pendingFile && !program && state.file && (await stat(state.file).catch(() => null))
                ? state.file
                : undefined;
        if (lastFile) opened = await openProgram(lastFile).catch(() => null);
        const params = new URLSearchParams(program ? `?data=${program}` : state.last);
        params.delete("kiosk");
        const search = kiosk ? withFlag(params, "kiosk") : params.size ? `?${params}` : "";
        openWindow(pendingFile ? "" : search, { kiosk });
        if (pendingFile) void openProgramFile(pendingFile);
    });
}
