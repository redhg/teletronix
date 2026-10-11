import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import type { Readable } from "node:stream";
import { openPackage } from "../scripts/ttx.ts";
import { idFor, nameFor } from "../src/package/format.ts";

// Where an opened program's files come from: a folder (a .json, with its files beside it, as
// public/data has them) or a package (a .ttx: a zip of the same).

/** A file a program has, to serve. */
export interface SourceFile {
    size: number;
    /** Its contents, or a part (inclusive) */
    stream(range?: { start: number; end: number }): Promise<Readable>;
}

/** A program opened from a file. */
export interface OpenProgram {
    /** The name it plays under: ?data=<name> */
    name: string;
    /** The file it was opened from: its .json, or its package */
    file: string;
    /** Whether the editor can save into it (a .json; a package is only for playing) */
    editable: boolean;
    /** A file of its, by its path under data/ ("images/map.png"); "<name>.json" is the program */
    find(path: string): Promise<SourceFile | null>;
    /** Its files' paths under data/, e.g. "images/map.png" */
    list(): Promise<string[]>;
    close(): Promise<void>;
}

export { nameFor };

/** A file under a folder, from a path in it; null for one that would leave it. */
export function fileUnder(folder: string, path: string): string | null {
    if (path.includes("\0")) return null;
    const file = normalize(join(folder, path));
    const root = normalize(folder.endsWith(sep) ? folder : folder + sep);
    return file.startsWith(root) ? file : null;
}

/** A file on disk, to serve (null if it isn't one). */
export async function diskFile(file: string | null): Promise<SourceFile | null> {
    if (!file) return null;
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return null;
    return {
        size: info.size,
        stream: async (range) => createReadStream(file, range ?? {}),
    };
}

/** Whether a file is a package, by its extension. */
export const isPackage = (file: string) => /\.(ttx|zip)$/i.test(file);

/** Opens a program from its file: a package, or a .json with its folder. */
export async function openProgram(file: string): Promise<OpenProgram> {
    return isPackage(file) ? openPackageProgram(file) : openFolderProgram(file);
}

async function openFolderProgram(file: string): Promise<OpenProgram> {
    // (an error now, rather than when it's played, if it isn't JSON)
    JSON.parse(await readFile(file, "utf8"));
    // (by its path, not its name: an address shouldn't give anything away)
    const name = idFor(file);
    const folder = dirname(file);
    return {
        name,
        file,
        editable: true,
        find: (path) => diskFile(path === `${name}.json` ? file : fileUnder(folder, path)),
        list: async () =>
            (await readdir(folder, { recursive: true }).catch(() => [] as string[])).map((path) =>
                path.replaceAll("\\", "/"),
            ),
        close: async () => {},
    };
}

async function openPackageProgram(file: string): Promise<OpenProgram> {
    const opened = await openPackage(file);
    // (by its path, not its name: an address shouldn't give anything away)
    const name = idFor(file);
    return {
        name,
        file,
        editable: false,
        find: async (path) => {
            const entry = path === `${name}.json` ? opened.program : opened.entry(path);
            if (!entry) return null;
            return {
                size: entry.size,
                stream: (range) => opened.reader.stream(entry, range),
            };
        },
        list: async () => opened.files(),
        close: () => opened.reader.close(),
    };
}
