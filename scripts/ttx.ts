import { basename, extname } from "node:path";
import { writeZip, type ZipEntry, type ZipInput, ZipReader } from "./zip.ts";

// Teletronix packages (.ttx): a program and its files in one zip archive, laid out as
// public/data has them, to hand to someone, or play in the desktop app.
//
//   heist.json          the program (any name; one .json at the top)
//   images/vault.png    a file it names as "data/images/vault.png"
//   audio/alarm.mp3     "data/audio/alarm.mp3"
//
// A zip of a folder like that (as Finder's Compress makes, with the folder in it) works too.

/** What's compressed already, so stored as is in a package: it can be read in part, too. */
const STORE = /\.(png|jpe?g|gif|webp|avif|mp3|ogg|m4a|wav|mp4|m4v|webm|ogv|mov|woff2?|otf|ttf)$/i;

/** Files that aren't the program's: macOS's resource forks, and hidden files (.DS_Store…). */
const junk = (name: string) => name.startsWith("__MACOSX/") || /(^|\/)\./.test(name);

/** A package, opened: its program, and its files by their paths under data/. */
export interface OpenedPackage {
    reader: ZipReader;
    /** The program's file in it */
    program: ZipEntry;
    /** A file, by its path under data/ ("images/vault.png") */
    entry(path: string): ZipEntry | undefined;
    /** Its files' paths under data/, but the program */
    files(): string[];
}

/**
 * Opens a package: finds its program (the one .json at its top, or, among several, the one
 * named as the package is), and checks it's JSON. An error says what's wrong with it.
 */
export async function openPackage(file: string): Promise<OpenedPackage> {
    const reader = await ZipReader.open(file);
    try {
        const names = [...reader.entries.keys()].filter((name) => !junk(name));
        // (everything in one folder: that folder is the top)
        const first = names[0]?.split("/")[0];
        const wrapped = names.length > 0 && names.every((name) => name.startsWith(`${first}/`));
        const top = wrapped ? `${first}/` : "";
        const programs = names.filter(
            (name) => name.slice(top.length).match(/^[^/]+\.json$/i) !== null,
        );
        const own = basename(file, extname(file)).toLowerCase();
        const chosen =
            programs.length === 1
                ? programs[0]
                : programs.find((name) => basename(name, ".json").toLowerCase() === own);
        if (!chosen) {
            throw new Error(
                programs.length === 0
                    ? "There's no program in it: a .json file at its top"
                    : `It has several programs, and none is named after it: ${programs.join(", ")}`,
            );
        }
        const program = reader.entries.get(chosen) as ZipEntry;
        JSON.parse((await reader.read(program)).toString("utf8"));
        return {
            reader,
            program,
            entry: (path) => (junk(path) ? undefined : reader.entries.get(top + path)),
            files: () =>
                names.filter((name) => name !== chosen).map((name) => name.slice(top.length)),
        };
    } catch (error) {
        await reader.close();
        throw error;
    }
}

/**
 * The files a program names (as "data/…", e.g. "data/images/vault.png"), each once, in the
 * order it names them: its images, sounds, videos, pointers.
 */
export function referencedFiles(program: unknown): string[] {
    const found = new Set<string>();
    const walk = (value: unknown) => {
        if (typeof value === "string") {
            if (/^data\/[^?#\s]+\.[A-Za-z0-9]+$/.test(value) && !value.includes("..")) {
                found.add(value);
            }
        } else if (Array.isArray(value)) {
            for (const item of value) walk(item);
        } else if (value && typeof value === "object") {
            for (const item of Object.values(value)) walk(item);
        }
    };
    walk(program);
    return [...found];
}

/**
 * Makes a package of a program and the files it names, found by `find` (from "data/…" to its
 * contents, or null). It says which it couldn't find (left out).
 */
export async function makePackage(
    program: { name: string; text: string },
    find: (path: string) => Promise<Buffer | null>,
    out: string,
): Promise<{ files: string[]; missing: string[] }> {
    const json: unknown = JSON.parse(program.text);
    const inputs: ZipInput[] = [
        { name: `${program.name}.json`, data: Buffer.from(program.text, "utf8"), compress: true },
    ];
    const files: string[] = [];
    const missing: string[] = [];
    for (const path of referencedFiles(json)) {
        const data = await find(path);
        if (!data) {
            missing.push(path);
            continue;
        }
        const name = path.slice("data/".length);
        inputs.push({ name, data, compress: !STORE.test(name) });
        files.push(path);
    }
    await writeZip(out, inputs);
    return { files, missing };
}
