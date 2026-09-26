import { type ParseError, type Program, parseProgram } from "../engine/index.ts";

type Failure = { ok: false; title: string; errors: ParseError[] };

export type FetchResult = { ok: true; json: unknown; url: string } | Failure;
export type LoadResult = { ok: true; program: Program } | Failure;

const fail = (title: string, message: string): Failure => ({
    ok: false,
    title,
    errors: [{ path: "", message }],
});

/** Fetches `public/data/<name>.json` as it's written, without checking it. */
export async function fetchProgramJson(name: string): Promise<FetchResult> {
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

/** Fetches and validates `public/data/<name>.json`. */
export async function loadProgram(name: string): Promise<LoadResult> {
    const file = await fetchProgramJson(name);
    if (!file.ok) return file;
    const result = parseProgram(file.json);
    return result.ok
        ? result
        : { ok: false, title: `${file.url} is invalid`, errors: result.errors };
}
