import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { basename, extname, join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createSaver } from "../scripts/editor-save.ts";
import { createRelay } from "../scripts/remote-relay.ts";

// The desktop app's server: Teletronix's build, a program opened from a file, the relay that
// pairs other devices on the network with a GM's panel, and the editor's saving, as
// `npm run table` serves them (see vite.config.ts), with nothing to install.
//
//   data/<name>.json   the opened program's file, by the name it plays under (?data=<name>)
//   data/…             its folder first (its images and sounds, beside it as public/data has
//                      them), then the build's
//   …                  the build; an address that isn't a file is the app (index.html)
//   __teletronix/…     the editor's saving (see scripts/editor-save.ts), into the opened
//                      program's file

const TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".otf": "font/otf",
    ".ttf": "font/ttf",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".webm": "video/webm",
    ".ogv": "video/ogg",
    ".mov": "video/quicktime",
};

/**
 * The service worker, left out: the app works offline already, and its cache would keep
 * serving a built-in program after the player saved their own copy of it.
 */
const LEFT_OUT = new Set(["/sw.js", "/registerSW.js"]);

type Next = (error?: unknown) => void;
type Middleware = (req: IncomingMessage, res: ServerResponse, next: Next) => void;

/** A program opened from a file. */
export interface OpenProgram {
    /** Its file */
    file: string;
    /** The folder it's in, served as data/ */
    folder: string;
    /** The name it plays under: ?data=<name> */
    name: string;
}

export interface AppServerOptions {
    /** The build (`dist`) */
    app: string;
    /** The program opened from a file, if one is */
    open: () => OpenProgram | null;
}

/** A name to play a file's program under: its name, with what an address can't have as "-". */
export const nameFor = (file: string) =>
    basename(file, extname(file))
        .replace(/[^A-Za-z0-9_-]+/g, "-")
        .replace(/^[-_]+|[-_]+$/g, "") || "program";

/** A file under a folder, from an address's path; null for one that would leave it. */
export function fileUnder(folder: string, path: string): string | null {
    let decoded: string;
    try {
        decoded = decodeURIComponent(path);
    } catch {
        return null;
    }
    if (decoded.includes("\0")) return null;
    const file = normalize(join(folder, decoded));
    const root = normalize(folder.endsWith(sep) ? folder : folder + sep);
    return file.startsWith(root) ? file : null;
}

/**
 * The file to serve for a path: the opened program (or a file beside it), the build's, or
 * the app itself.
 */
export async function resolveFile(
    options: AppServerOptions,
    path: string,
): Promise<{ file: string; size: number } | null> {
    const candidates: (string | null)[] = [];
    const open = options.open();
    if (open && path === `/data/${open.name}.json`) candidates.push(open.file);
    else if (open && path.startsWith("/data/")) {
        candidates.push(fileUnder(open.folder, path.slice("/data/".length)));
    }
    candidates.push(fileUnder(options.app, path === "/" ? "index.html" : path));
    for (const file of candidates) {
        if (!file) continue;
        const info = await stat(file).catch(() => null);
        if (info?.isFile()) return { file, size: info.size };
    }
    // an address that isn't a file (and doesn't look like one) is the app
    if (extname(path) === "") {
        const index = join(options.app, "index.html");
        const info = await stat(index).catch(() => null);
        if (info?.isFile()) return { file: index, size: info.size };
    }
    return null;
}

/** "bytes=0-1023" for a file of a size: the range, or null for none (or one it can't serve). */
export function parseRange(header: string | undefined, size: number) {
    const match = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match) return null;
    const [, from = "", to = ""] = match;
    if (from === "" && to === "") return null;
    // "bytes=-500": the last 500
    const start = from === "" ? Math.max(0, size - Number(to)) : Number(from);
    const end = from === "" || to === "" ? size - 1 : Math.min(size - 1, Number(to));
    if (start > end || start >= size) return "unsatisfiable" as const;
    return { start, end };
}

/** Serves a file, or the part of it asked for (as video players ask, Safari's especially). */
async function serveFile(req: IncomingMessage, res: ServerResponse, options: AppServerOptions) {
    const path = new URL(req.url ?? "/", "http://app").pathname;
    if (LEFT_OUT.has(path)) return finish(res, 404);
    const found = await resolveFile(options, path);
    if (!found) return finish(res, 404);
    if (found.file === join(options.app, "index.html")) return serveApp(req, res, found.file);
    const type = TYPES[extname(found.file).toLowerCase()] ?? "application/octet-stream";
    const range = parseRange(req.headers.range, found.size);
    if (range === "unsatisfiable") {
        res.writeHead(416, { "Content-Range": `bytes */${found.size}` });
        res.end();
        return;
    }
    const headers: Record<string, string | number> = {
        "Content-Type": type,
        "Accept-Ranges": "bytes",
        // (a program changed in its folder shows at the next load)
        "Cache-Control": "no-cache",
    };
    if (range) {
        res.writeHead(206, {
            ...headers,
            "Content-Range": `bytes ${range.start}-${range.end}/${found.size}`,
            "Content-Length": range.end - range.start + 1,
        });
    } else {
        res.writeHead(200, { ...headers, "Content-Length": found.size });
    }
    if (req.method === "HEAD") return res.end();
    createReadStream(found.file, range ?? {}).pipe(res);
}

/**
 * The app's page, marked as the desktop app's (`<meta name="teletronix-desktop">`), so the
 * editor knows it can save here: elsewhere it doesn't ask, as asking offline, or online
 * (where there's nothing to answer), only fails.
 */
async function serveApp(req: IncomingMessage, res: ServerResponse, file: string) {
    const html = (await readFile(file, "utf8")).replace(
        "<head>",
        '<head><meta name="teletronix-desktop" content="">',
    );
    res.writeHead(200, {
        "Content-Type": TYPES[".html"] as string,
        "Content-Length": Buffer.byteLength(html),
        "Cache-Control": "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : html);
}

function finish(res: ServerResponse, status: number) {
    res.statusCode = status;
    res.end();
}

const SAVE = /^\/__teletronix\/save(?:\/([A-Za-z0-9][A-Za-z0-9_-]*)\.json)?$/;
const FILES = /^\/__teletronix\/files\//;
/** The largest program accepted. */
const MAX_BYTES = 10 * 1024 * 1024;
const LOCAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * The editor's saving, into the opened program's file (and the files beside it, to choose
 * from), from this computer only. With no program opened, there's nothing to save into: the
 * editor downloads instead.
 */
function openSaving(options: AppServerOptions): Middleware {
    return (req, res, next) => {
        const path = new URL(req.url ?? "/", "http://app").pathname;
        const save = SAVE.exec(path);
        if (!save && !FILES.test(path)) return next();
        const open = options.open();
        if (!open) return finish(res, 404);
        if (!save) return createSaver(pathToFileURL(open.folder + sep))(req, res, next);
        if (!LOCAL.has(req.socket.remoteAddress ?? "")) return finish(res, 403);
        if (req.method === "GET" && !save[1]) return finish(res, 204);
        if (req.method !== "PUT" || save[1] !== open.name) return finish(res, 404);
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => {
            body += chunk;
        });
        req.on("end", () => {
            if (body.length > MAX_BYTES) return finish(res, 413);
            try {
                JSON.parse(body);
            } catch {
                return finish(res, 400);
            }
            writeFile(open.file, body).then(
                () => {
                    res.setHeader("X-Saved-To", open.file);
                    finish(res, 204);
                },
                () => finish(res, 500),
            );
        });
    };
}

/** The whole server, as a request handler: relay, saving, then files. */
export function appHandler(options: AppServerOptions) {
    const chain: Middleware[] = [createRelay({ exposed: () => true }), openSaving(options)];
    return (req: IncomingMessage, res: ServerResponse) => {
        const run = (i: number) => {
            const middleware = chain[i];
            if (!middleware) {
                if (req.method !== "GET" && req.method !== "HEAD") return finish(res, 405);
                serveFile(req, res, options).catch(() => finish(res, 500));
                return;
            }
            middleware(req, res, (error) => (error ? finish(res, 500) : run(i + 1)));
        };
        run(0);
    };
}

/**
 * Starts the server on the network, on the first free port from `port` (so its address,
 * and so what the browser keeps for it, stays the same from one run to the next).
 */
export async function startAppServer(
    options: AppServerOptions,
    port = 4173,
    tries = 20,
): Promise<{ server: Server; port: number }> {
    for (let attempt = 0; attempt < tries; attempt++) {
        const server = createServer(appHandler(options));
        const listening = await new Promise<boolean>((resolve) => {
            server.once("error", () => resolve(false));
            server.listen(port + attempt, () => resolve(true));
        });
        if (listening) return { server, port: port + attempt };
    }
    throw new Error(`No free port from ${port} to ${port + tries - 1}`);
}
