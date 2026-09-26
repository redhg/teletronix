import { type ParseError, type Program, parseProgram } from "../engine/index.ts";

export type LoadResult =
    | { ok: true; program: Program }
    | { ok: false; title: string; errors: ParseError[] };

/** Fetches and validates `public/data/<name>.json`. */
export async function loadProgram(name: string): Promise<LoadResult> {
    const fail = (title: string, message: string): LoadResult => ({
        ok: false,
        title,
        errors: [{ path: "", message }],
    });

    if (!/^[\w-]+$/.test(name)) {
        return fail("Invalid program name", `"${name}" may only contain letters, digits, _ and -`);
    }

    const url = `${import.meta.env.BASE_URL}data/${name}.json`;
    let json: unknown;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return fail(`Can't load ${url}`, `${response.status} ${response.statusText}`);
        }
        // dev servers and static hosts often answer missing files with an HTML page
        if (!response.headers.get("content-type")?.includes("json")) {
            return fail(`Can't load ${url}`, "File not found");
        }
        json = await response.json();
    } catch (error) {
        return fail(`Can't load ${url}`, error instanceof Error ? error.message : String(error));
    }

    const result = parseProgram(json);
    return result.ok ? result : { ok: false, title: `${url} is invalid`, errors: result.errors };
}
