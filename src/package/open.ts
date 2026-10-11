import { readPackage } from "./browser.ts";
import { idFor } from "./format.ts";
import { PACKAGE_PREFIX, putPackage } from "./store.ts";
import "./open.css";

// Opening a package (.ttx) in the browser: dropped on the page, or chosen (Cmd/Ctrl+O, or the
// button where a package is missing). It's kept in this browser (see store.ts), then played.

const isPackageFile = (file: File) => /\.(ttx|zip)$/i.test(file.name);

/**
 * Opens a package's file: checks it (an error says what's wrong), keeps it, and plays it here,
 * as `?data=ttx:<name>` (kept a kiosk, if this is one).
 */
export async function openPackageFile(file: File): Promise<void> {
    if (!isPackageFile(file)) throw new Error(`${file.name} isn't a package (.ttx)`);
    await readPackage(file, file.name);
    // (by its contents, not its name: an address shouldn't give anything away)
    const id = idFor(new Uint8Array(await file.arrayBuffer()));
    await putPackage({ id, fileName: file.name, file, added: Date.now() });
    const kiosk = new URLSearchParams(location.search).has("kiosk");
    location.assign(`?data=${PACKAGE_PREFIX}${id}${kiosk ? "&kiosk" : ""}`);
}

/** Asks for a package's file, and opens it (reporting what's wrong, if it can't). */
export function choosePackage(report: (message: string) => void = showMessage): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ttx,.zip";
    input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (file) openPackageFile(file).catch((error: unknown) => report(messageOf(error)));
    });
    input.click();
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

let overlay: HTMLElement | null = null;
let hideTimer = 0;

/** The overlay over the page: while a file's dragged over it, or saying what went wrong. */
function show(text: string, alert = false) {
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "package-drop";
        overlay.setAttribute("role", "status");
        overlay.addEventListener("click", hide);
        document.body.append(overlay);
    }
    clearTimeout(hideTimer);
    overlay.textContent = text;
    overlay.classList.toggle("alert", alert);
    overlay.hidden = false;
}

function hide() {
    if (overlay) overlay.hidden = true;
}

function showMessage(message: string) {
    show(`CAN'T OPEN IT: ${message}`, true);
    hideTimer = window.setTimeout(hide, 5000);
}

const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

/**
 * Lets the page open packages: dropped on it (showing where while one's dragged over), or
 * chosen with Cmd/Ctrl+O.
 */
export function acceptPackages(): void {
    // (enter and leave come for every element crossed: counted, to know when it's left the page)
    let over = 0;
    document.addEventListener("dragenter", (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        over++;
        show("DROP A TELETRONIX PACKAGE (.TTX) TO PLAY IT");
    });
    document.addEventListener("dragover", (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });
    document.addEventListener("dragleave", (event) => {
        if (!hasFiles(event)) return;
        over = Math.max(0, over - 1);
        if (over === 0) hide();
    });
    document.addEventListener("drop", (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        over = 0;
        hide();
        const file = event.dataTransfer?.files[0];
        if (file) openPackageFile(file).catch((error: unknown) => showMessage(messageOf(error)));
    });
    document.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "o") {
            event.preventDefault();
            choosePackage();
        }
    });
}
