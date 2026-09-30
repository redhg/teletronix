const files = new Map<string, Promise<Uint8Array>>();

/** Loads a file's bytes once; later calls share the result. */
export function loadBytes(src: string): Promise<Uint8Array> {
    let bytes = files.get(src);
    if (!bytes) {
        bytes = fetch(src).then(async (response) => {
            // dev servers and static hosts often answer missing files with an HTML page
            const type = response.headers.get("content-type") ?? "";
            if (!response.ok || type.includes("html")) throw new Error(`Can't load ${src}`);
            return new Uint8Array(await response.arrayBuffer());
        });
        files.set(src, bytes);
    }
    return bytes;
}
