import { basename } from "node:path";
import { packageLayout, referencedFiles } from "../src/package/format.ts";
import { writeZip, type ZipEntry, type ZipInput, ZipReader } from "./zip.ts";

export { referencedFiles };

// Teletronix packages (.ttx) in Node: opening one (the desktop app) and making one (the app's
// Export as Package…, and scripts/package.ts). What a package is: src/package/format.ts.

/** What's compressed already, so stored as is in a package: it can be read in part, too. */
const STORE = /\.(png|jpe?g|gif|webp|avif|mp3|ogg|m4a|wav|mp4|m4v|webm|ogv|mov|woff2?|otf|ttf)$/i;

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
        const layout = packageLayout([...reader.entries.keys()], basename(file));
        const program = reader.entries.get(layout.program) as ZipEntry;
        JSON.parse((await reader.read(program)).toString("utf8"));
        const files = new Set(layout.files);
        return {
            reader,
            program,
            entry: (path) => (files.has(path) ? reader.entries.get(layout.top + path) : undefined),
            files: () => layout.files,
        };
    } catch (error) {
        await reader.close();
        throw error;
    }
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
