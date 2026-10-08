import { readdir, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";

// Lets the editor (`?edit`) save a program straight into public/data, in the dev server only
// (see vite.config.ts). Elsewhere, the editor downloads the file instead.
//
//   GET __teletronix/save              204: saving is possible here
//   PUT __teletronix/save/<name>.json  writes public/data/<name>.json (the body: the JSON)
//   GET __teletronix/files/<kind>      the audio, images or video files in public/data, to
//                                      choose from: ["data/audio/drone.mp3", …]
//
// Only from this computer, even when the server is open to the network (--host): another
// device on the network can't change the files.

const PATH = /\/__teletronix\/save(?:\/([A-Za-z0-9][A-Za-z0-9_-]*)\.json)?$/;
const FILES_PATH = /\/__teletronix\/files\/(audio|images|video)$/;
/** Each kind of file, by its extensions. */
const KINDS: Record<string, RegExp> = {
    audio: /\.(mp3|ogg|wav|m4a)$/i,
    images: /\.(png|jpe?g|gif|webp|svg|avif)$/i,
    video: /\.(mp4|m4v|webm|ogv|mov)$/i,
};
/** The largest program accepted. */
const MAX_BYTES = 10 * 1024 * 1024;
const LOCAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

type Next = (error?: unknown) => void;

/** The save endpoint: a middleware for Connect (which Vite's servers use). */
export function createSaver(folder: URL) {
    return (req: IncomingMessage, res: ServerResponse, next: Next): void => {
        const pathname = new URL(req.url ?? "", "http://editor").pathname;
        const match = PATH.exec(pathname);
        const files = FILES_PATH.exec(pathname);
        if (files?.[1]) {
            if (req.method === "GET") listFiles(folder, KINDS[files[1]] as RegExp, res);
            else finish(res, 405);
        } else if (!match) {
            next();
        } else if (!LOCAL.has(req.socket.remoteAddress ?? "")) {
            finish(res, 403);
        } else if (req.method === "GET" && !match[1]) {
            finish(res, 204);
        } else if (req.method === "PUT" && match[1]) {
            save(new URL(`${match[1]}.json`, folder), req, res);
        } else {
            finish(res, 405);
        }
    };
}

function save(file: URL, req: IncomingMessage, res: ServerResponse): void {
    let body = "";
    let tooBig = false;
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
        body += chunk;
        if (body.length > MAX_BYTES) tooBig = true;
    });
    req.on("end", () => {
        if (tooBig) {
            finish(res, 413);
            return;
        }
        try {
            JSON.parse(body);
        } catch {
            finish(res, 400);
            return;
        }
        writeFile(file, body).then(
            () => finish(res, 204),
            () => finish(res, 500),
        );
    });
}

/** The files of a kind in the folder (and the folders in it), as a program names them. */
function listFiles(folder: URL, kind: RegExp, res: ServerResponse): void {
    const send = (files: string[]) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(files));
    };
    readdir(folder, { recursive: true }).then(
        (names) =>
            send(
                names
                    .map((name) => name.replaceAll("\\", "/"))
                    .filter((name) => kind.test(name))
                    .sort()
                    .map((name) => `data/${name}`),
            ),
        // (no folder: no files)
        () => send([]),
    );
}

function finish(res: ServerResponse, status: number): void {
    res.statusCode = status;
    res.end();
}
