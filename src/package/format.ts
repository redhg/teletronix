// Teletronix packages (.ttx), as far as both readers need them: the browser's
// (src/package/browser.ts) and Node's (scripts/zip.ts, scripts/ttx.ts). A package is a zip
// archive of a program and its files, laid out as public/data has them:
//
//   heist.json          the program (any name; one .json at the top)
//   images/vault.png    a file it names as "data/images/vault.png"
//
// A zip of a folder like that (as Finder's Compress makes, with the folder in it) works too.
// Only what zips are made with in practice is read: files stored or deflated, without
// encryption, and no Zip64 (over 4 GB, or 65,535 files).

export const LOCAL_HEADER = 0x04034b50;
export const CENTRAL_HEADER = 0x02014b50;
export const END_OF_DIRECTORY = 0x06054b50;
/** Bit 0 of the flags: encrypted. Bit 11: the name is UTF-8. */
const ENCRYPTED = 1;
export const UTF8 = 1 << 11;
export const STORED = 0;
export const DEFLATED = 8;
/** The most a 32-bit size or offset can be: beyond it, a zip needs Zip64. */
export const MAX_32 = 0xffffffff;
/** The end-of-directory record's size, and how much before it a comment can take. */
export const END_SIZE = 22;
export const MAX_COMMENT = 0xffff;

export interface ZipEntry {
    /** Its path in the archive, with "/" between folders */
    name: string;
    /** 0: stored as is; 8: deflated */
    method: number;
    compressedSize: number;
    size: number;
    crc: number;
    /** Where its local header is */
    offset: number;
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.length);

/**
 * Where an archive's directory is, from its tail (its last END_SIZE + MAX_COMMENT bytes, or
 * all of it): its entries' count, size and offset. An error if it isn't an archive it reads.
 */
export function findDirectory(tail: Uint8Array): { count: number; size: number; offset: number } {
    const data = view(tail);
    for (let i = tail.length - END_SIZE; i >= 0; i--) {
        if (data.getUint32(i, true) !== END_OF_DIRECTORY) continue;
        const count = data.getUint16(i + 10, true);
        const offset = data.getUint32(i + 16, true);
        if (count === 0xffff || offset === MAX_32) {
            throw new Error("A Zip64 archive (over 4 GB, or 65,535 files): too big to read");
        }
        return { count, size: data.getUint32(i + 12, true), offset };
    }
    throw new Error("Not a zip archive");
}

/** An archive's files (not its folders), by name, from its directory. */
export function parseDirectory(directory: Uint8Array, count: number): Map<string, ZipEntry> {
    const data = view(directory);
    const decoder = new TextDecoder();
    const entries = new Map<string, ZipEntry>();
    let at = 0;
    for (let i = 0; i < count; i++) {
        if (at + 46 > directory.length || data.getUint32(at, true) !== CENTRAL_HEADER) {
            throw new Error("A damaged archive");
        }
        const flags = data.getUint16(at + 8, true);
        const method = data.getUint16(at + 10, true);
        const nameLength = data.getUint16(at + 28, true);
        const extraLength = data.getUint16(at + 30, true);
        const commentLength = data.getUint16(at + 32, true);
        // (read as UTF-8 whether or not it's marked so: names not marked are meant to be in
        // the old DOS code page, but tools write UTF-8 in practice, and ASCII reads the same)
        const name = decoder
            .decode(directory.subarray(at + 46, at + 46 + nameLength))
            .replaceAll("\\", "/");
        const entry: ZipEntry = {
            name,
            method,
            crc: data.getUint32(at + 16, true),
            compressedSize: data.getUint32(at + 20, true),
            size: data.getUint32(at + 24, true),
            offset: data.getUint32(at + 42, true),
        };
        at += 46 + nameLength + extraLength + commentLength;
        if (name.endsWith("/")) continue;
        if (flags & ENCRYPTED) throw new Error(`Encrypted: ${name}`);
        if (method !== STORED && method !== DEFLATED) {
            throw new Error(`Compressed in a way it can't read: ${name}`);
        }
        entries.set(name, entry);
    }
    return entries;
}

/** Where a file's data starts, from its local header's first 30 bytes (its length varies). */
export function dataStart(entry: ZipEntry, localHeader: Uint8Array): number {
    const data = view(localHeader);
    if (localHeader.length < 30 || data.getUint32(0, true) !== LOCAL_HEADER) {
        throw new Error(`Damaged: ${entry.name}`);
    }
    return entry.offset + 30 + data.getUint16(26, true) + data.getUint16(28, true);
}

/** Files that aren't the program's: macOS's resource forks, and hidden files (.DS_Store…). */
export const isJunk = (name: string) => name.startsWith("__MACOSX/") || /(^|\/)\./.test(name);

/**
 * A package's layout, from its files' names: the folder everything's in (if it's a zip of a
 * folder), its program (the one .json at the top, or, among several, the one named as the
 * package is), and its other files. An error says what's wrong with it.
 */
export function packageLayout(
    names: string[],
    packageName: string,
): { top: string; program: string; files: string[] } {
    const kept = names.filter((name) => !isJunk(name));
    // (everything in one folder: that folder is the top)
    const first = kept[0]?.split("/")[0];
    const top =
        kept.length > 0 && kept.every((name) => name.startsWith(`${first}/`)) ? `${first}/` : "";
    const programs = kept.filter((name) => /^[^/]+\.json$/i.test(name.slice(top.length)));
    const own = packageName.replace(/\.[^.]*$/, "").toLowerCase();
    const program =
        programs.length === 1
            ? programs[0]
            : programs.find(
                  (name) => name.slice(top.length, -".json".length).toLowerCase() === own,
              );
    if (!program) {
        throw new Error(
            programs.length === 0
                ? "There's no program in it: a .json file at its top"
                : `It has several programs, and none is named after it: ${programs.join(", ")}`,
        );
    }
    return {
        top,
        program,
        files: kept.filter((name) => name !== program).map((name) => name.slice(top.length)),
    };
}

/** Whether a string in a program names one of its files: "data/images/vault.png". */
export const isDataPath = (value: string) =>
    /^data\/[^?#\s]+\.[A-Za-z0-9]+$/.test(value) && !value.split("/").includes("..");

/**
 * The files a program names (as "data/…"), each once, in the order it names them: its images,
 * sounds, videos, pointers.
 */
export function referencedFiles(program: unknown): string[] {
    const found = new Set<string>();
    const walk = (value: unknown) => {
        if (typeof value === "string") {
            if (isDataPath(value)) found.add(value);
        } else if (Array.isArray(value)) {
            for (const item of value) walk(item);
        } else if (value && typeof value === "object") {
            for (const item of Object.values(value)) walk(item);
        }
    };
    walk(program);
    return [...found];
}

/** A copy of a program with the files it names swapped for other addresses (where given). */
export function withFiles(program: unknown, addresses: Map<string, string>): unknown {
    if (typeof program === "string") return addresses.get(program) ?? program;
    if (Array.isArray(program)) return program.map((item) => withFiles(item, addresses));
    if (program && typeof program === "object") {
        return Object.fromEntries(
            Object.entries(program).map(([key, value]) => [key, withFiles(value, addresses)]),
        );
    }
    return program;
}

/** A name to play a package (or a program's file) under: what an address can't have, as "-". */
export const nameFor = (fileName: string) =>
    fileName
        .replace(/^.*[/\\]/, "")
        .replace(/\.[^.]*$/, "")
        .replace(/[^A-Za-z0-9_-]+/g, "-")
        .replace(/^[-_]+|[-_]+$/g, "") || "program";

/** A file's type, by its extension, for serving or making it a Blob. */
export const TYPES: Record<string, string> = {
    json: "application/json",
    txt: "text/plain",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    mp4: "video/mp4",
    m4v: "video/mp4",
    webm: "video/webm",
    ogv: "video/ogg",
    mov: "video/quicktime",
    woff: "font/woff",
    woff2: "font/woff2",
    otf: "font/otf",
    ttf: "font/ttf",
};

export const typeOf = (name: string) =>
    TYPES[name.slice(name.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";
