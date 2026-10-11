// Packages shared through Cloudflare, by GMs with a key (see scripts/gm-keys.ts): uploaded once,
// downloaded by the players in the GM's session, deleted when the session ends (and by the
// bucket's rule, a day after, whatever happens). The relay's Worker (relay/cloudflare.ts) serves
// them, beside its sessions.
//
//   POST   /packages          a package (the body), with "Authorization: Bearer <key>":
//                            { "id", "size" }
//   GET    /packages/<id>     it, to whoever has its id (only the session's players get it)
//   DELETE /packages/<id>     it, by the key that uploaded it

/** The largest package. */
export const MAX_PACKAGE = 50 * 1024 * 1024;
/** How much one key may have uploaded in a day. */
export const DAILY_QUOTA = 500 * 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;

export interface PackagesEnv {
    GM_KEYS: KVNamespace;
    PACKAGES: R2Bucket;
}

/** A key's uploads in the last day: how big, and when. */
type Usage = { id: string; size: number; at: number }[];

/** A key's fingerprint (SHA-256, as hex): what's kept of it. */
export async function fingerprint(key: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The key a request carries, by its fingerprint, if it's one of the GMs' keys. */
async function keyOf(request: Request, env: PackagesEnv): Promise<string | null> {
    const key = /^Bearer (\S{16,200})$/.exec(request.headers.get("Authorization") ?? "")?.[1];
    if (!key) return null;
    const print = await fingerprint(key);
    return (await env.GM_KEYS.get(print)) === null ? null : print;
}

/** A new package's id: 128 random bits, as hex (only the session's players get it). */
function newId(): string {
    return [...crypto.getRandomValues(new Uint8Array(16))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
    });

/** Answers a request about packages (the path starting /packages); `cors` for the page's origin. */
export async function packages(
    request: Request,
    env: PackagesEnv,
    cors: HeadersInit,
): Promise<Response> {
    const url = new URL(request.url);
    const id = /^\/packages\/([0-9a-f]{32})$/.exec(url.pathname)?.[1];

    if (request.method === "GET" && id) {
        const object = await env.PACKAGES.get(`packages/${id}`);
        if (!object) return new Response(null, { status: 404, headers: cors });
        return new Response(object.body, {
            headers: {
                ...cors,
                "Content-Type": "application/zip",
                "Content-Length": String(object.size),
                "Cache-Control": "private, no-store",
            },
        });
    }

    if (request.method === "POST" && url.pathname === "/packages") {
        const key = await keyOf(request, env);
        if (!key) return json({ error: "That upload key isn't one" }, 401, cors);
        const size = Number(request.headers.get("Content-Length"));
        if (!Number.isInteger(size) || size <= 0) return json({ error: "No length" }, 411, cors);
        if (size > MAX_PACKAGE) return json({ error: "Too big (50 MB at most)" }, 413, cors);
        const now = Date.now();
        const usage = ((await env.GM_KEYS.get<Usage>(`usage:${key}`, "json")) ?? []).filter(
            (upload) => now - upload.at < DAY,
        );
        const used = usage.reduce((sum, upload) => sum + upload.size, 0);
        if (used + size > DAILY_QUOTA) {
            return json({ error: "This key's uploads for today are used up" }, 429, cors);
        }
        const newPackage = newId();
        await env.PACKAGES.put(`packages/${newPackage}`, request.body, {
            customMetadata: { key, at: String(now) },
        });
        usage.push({ id: newPackage, size, at: now });
        await env.GM_KEYS.put(`usage:${key}`, JSON.stringify(usage), {
            expirationTtl: DAY / 1000 + 3600,
        });
        return json({ id: newPackage, size }, 201, cors);
    }

    if (request.method === "DELETE" && id) {
        const key = await keyOf(request, env);
        const object = key ? await env.PACKAGES.head(`packages/${id}`) : null;
        // (only by the key that uploaded it)
        if (!key || !object || object.customMetadata?.key !== key) {
            return new Response(null, { status: 404, headers: cors });
        }
        await env.PACKAGES.delete(`packages/${id}`);
        return new Response(null, { status: 204, headers: cors });
    }

    return new Response(null, { status: 405, headers: cors });
}
