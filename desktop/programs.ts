import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** A program to open from the menu. */
export interface ProgramEntry {
    /** Its file's name without .json: its address, ?data=<name> */
    name: string;
    /** Its config.name, or its file's name */
    title: string;
}

/** The programs in a folder (the built-in ones): its .json files with a config, by title. */
export async function listPrograms(folder: string): Promise<ProgramEntry[]> {
    const names = await readdir(folder).catch(() => [] as string[]);
    const entries = await Promise.all(
        names
            .filter((file) => /^[A-Za-z0-9][A-Za-z0-9_-]*\.json$/.test(file))
            .map(async (file): Promise<ProgramEntry | null> => {
                try {
                    const json = JSON.parse(await readFile(join(folder, file), "utf8")) as {
                        config?: { name?: unknown };
                    };
                    if (!json.config) return null;
                    const name = file.slice(0, -".json".length);
                    const title = typeof json.config.name === "string" ? json.config.name : name;
                    return { name, title };
                } catch {
                    return null;
                }
            }),
    );
    return entries
        .filter((entry): entry is ProgramEntry => entry !== null)
        .sort((a, b) => a.title.localeCompare(b.title));
}
