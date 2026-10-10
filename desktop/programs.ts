import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** A program to open from the menu. */
export interface ProgramEntry {
    /** Its file's name without .json: its address, ?data=<name> */
    name: string;
    /** Its config.name, or its file's name */
    title: string;
    /** In the player's programs folder (their own, or their copy of a built-in one) */
    own: boolean;
}

/** The programs in a folder: its .json files with a config, by title. */
async function programsIn(folder: string, own: boolean): Promise<ProgramEntry[]> {
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
                    return { name, title, own };
                } catch {
                    return null;
                }
            }),
    );
    return entries.filter((entry): entry is ProgramEntry => entry !== null);
}

/**
 * Every program the app can play: the player's own (which win over a built-in one of the same
 * name, as the server serves theirs), then the built-in ones, each by title.
 */
export async function listPrograms(builtIn: string, own: string): Promise<ProgramEntry[]> {
    const [mine, theirs] = await Promise.all([programsIn(own, true), programsIn(builtIn, false)]);
    const byTitle = (a: ProgramEntry, b: ProgramEntry) => a.title.localeCompare(b.title);
    const taken = new Set(mine.map((entry) => entry.name));
    return [
        ...mine.sort(byTitle),
        ...theirs.filter((entry) => !taken.has(entry.name)).sort(byTitle),
    ];
}
