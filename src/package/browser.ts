import {
    DEFLATED,
    dataStart,
    END_SIZE,
    findDirectory,
    MAX_COMMENT,
    packageLayout,
    parseDirectory,
    typeOf,
    type ZipEntry,
} from "./format.ts";

// A package (.ttx) in the browser: read straight from its file (a Blob), its stored files
// sliced from it as they are, its deflated ones inflated by the browser (DecompressionStream).

const bytes = async (blob: Blob, start: number, end: number) =>
    new Uint8Array(await blob.slice(start, end).arrayBuffer());

export interface BrowserPackage {
    /** The package's file name, e.g. "heist.ttx" */
    fileName: string;
    /** The program, as it's written */
    programText: string;
    /** Its files' paths under data/, but the program ("images/vault.png") */
    files: string[];
    /** A file, by its path under data/ */
    file(path: string): Promise<Blob | null>;
}

/** Opens a package: an error says what's wrong with it (not a zip, no program, not JSON…). */
export async function readPackage(blob: Blob, fileName: string): Promise<BrowserPackage> {
    const tailStart = Math.max(0, blob.size - END_SIZE - MAX_COMMENT);
    const where = findDirectory(await bytes(blob, tailStart, blob.size));
    const entries = parseDirectory(
        await bytes(blob, where.offset, where.offset + where.size),
        where.count,
    );
    const layout = packageLayout([...entries.keys()], fileName);

    const contents = async (entry: ZipEntry): Promise<Blob> => {
        const start = dataStart(entry, await bytes(blob, entry.offset, entry.offset + 30));
        const type = typeOf(entry.name);
        const data = blob.slice(start, start + entry.compressedSize);
        if (entry.method !== DEFLATED) return data.slice(0, entry.size, type);
        const inflated = await new Response(
            data.stream().pipeThrough(new DecompressionStream("deflate-raw")),
        ).blob();
        if (inflated.size !== entry.size) throw new Error(`Damaged: ${entry.name}`);
        return new Blob([inflated], { type });
    };

    const programText = await (await contents(entries.get(layout.program) as ZipEntry)).text();
    // (an error now, rather than when it's played, if it isn't JSON)
    JSON.parse(programText);
    const files = new Set(layout.files);
    return {
        fileName,
        programText,
        files: layout.files,
        file: async (path) => {
            const entry = files.has(path) ? entries.get(layout.top + path) : undefined;
            return entry ? contents(entry) : null;
        },
    };
}

/**
 * Addresses in this window for a package's files ("data/images/vault.png" to a blob: URL),
 * for a program to play with them. They last as long as the page, as the program does.
 */
export async function packageAddresses(pkg: BrowserPackage): Promise<Map<string, string>> {
    const addresses = new Map<string, string>();
    for (const path of pkg.files) {
        const file = await pkg.file(path);
        // (named after the #, which loading ignores: a program's type of file, video or image,
        // goes by the end of its address, e.g. ".mp4", which a blob: address hasn't got)
        if (file) addresses.set(`data/${path}`, `${URL.createObjectURL(file)}#${encodeURI(path)}`);
    }
    return addresses;
}
