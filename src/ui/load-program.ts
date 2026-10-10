import { type ParseError, type Program, parseProgram } from "../engine/index.ts";
import { type BrowserPackage, packageAddresses, readPackage } from "../package/browser.ts";
import { withFiles } from "../package/format.ts";
import { getPackage, PACKAGE_PREFIX } from "../package/store.ts";

type Failure = {
    ok: false;
    title: string;
    errors: ParseError[];
    /** A package that isn't in this browser, by its name: it can be chosen here */
    missingPackage?: string;
};

export type FetchResult =
    | {
          ok: true;
          json: unknown;
          url: string;
          /** For a package's program (`?data=ttx:<name>`): the package */
          package?: BrowserPackage;
      }
    | Failure;
export type LoadResult =
    | {
          ok: true;
          program: Program;
          /** For a package's program: where its files are in this window, by "data/…" */
          files?: Map<string, string>;
      }
    | Failure;

const fail = (title: string, message: string): Failure => ({
    ok: false,
    title,
    errors: [{ path: "", message }],
});

/**
 * Fetches `public/data/<name>.json` as it's written, without checking it; or, for
 * `ttx:<name>`, the program in a package opened in this browser (see src/package/store.ts).
 */
export async function fetchProgramJson(name: string): Promise<FetchResult> {
    if (name.startsWith(PACKAGE_PREFIX)) return fetchPackage(name.slice(PACKAGE_PREFIX.length));
    if (!/^[\w-]+$/.test(name)) {
        return fail("Invalid program name", `"${name}" may only contain letters, digits, _ and -`);
    }

    const url = `${import.meta.env.BASE_URL}data/${name}.json`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return fail(`Can't load ${url}`, `${response.status} ${response.statusText}`);
        }
        // dev servers and static hosts often answer missing files with an HTML page
        if (!response.headers.get("content-type")?.includes("json")) {
            return fail(`Can't load ${url}`, "File not found");
        }
        return { ok: true, json: await response.json(), url };
    } catch (error) {
        return fail(`Can't load ${url}`, error instanceof Error ? error.message : String(error));
    }
}

async function fetchPackage(id: string): Promise<FetchResult> {
    const stored = await getPackage(id).catch(() => undefined);
    if (!stored) {
        return {
            ...fail(
                `The package "${id}" isn't in this browser`,
                "It was opened in another browser, or on another device. Choose its file " +
                    "(.ttx) to play it here too.",
            ),
            missingPackage: id,
        };
    }
    try {
        const pkg = await readPackage(stored.file, stored.fileName);
        return { ok: true, json: JSON.parse(pkg.programText), url: stored.fileName, package: pkg };
    } catch (error) {
        return fail(
            `Can't open ${stored.fileName}`,
            error instanceof Error ? error.message : String(error),
        );
    }
}

/** For a package's name (`ttx:<name>`): where its files are in this window, by "data/…". */
export async function packageFiles(name: string | null): Promise<Map<string, string> | undefined> {
    if (!name?.startsWith(PACKAGE_PREFIX)) return undefined;
    const file = await fetchProgramJson(name);
    return file.ok && file.package ? packageAddresses(file.package) : undefined;
}

/**
 * Fetches and validates a program: `public/data/<name>.json`, or a package's, with its files
 * where they are in this window.
 */
export async function loadProgram(name: string): Promise<LoadResult> {
    const file = await fetchProgramJson(name);
    if (!file.ok) return file;
    const files = file.package && (await packageAddresses(file.package));
    const result = parseProgram(files ? withFiles(file.json, files) : file.json);
    if (!result.ok) return { ok: false, title: `${file.url} is invalid`, errors: result.errors };
    return files ? { ...result, files } : result;
}
