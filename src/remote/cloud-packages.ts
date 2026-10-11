import { getPackage, PACKAGE_PREFIX } from "../package/store.ts";
import { INTERNET_RELAY, isLocalHost } from "./relay-address.ts";

// Packages shared through Cloudflare, for a GM with an upload key (see relay/packages.ts and
// scripts/gm-keys.ts): the panel uploads the package once, and the players in its session
// download it from there (faster than through the session, and up to 50 MB). Only for a page
// whose sessions go through the internet relay; without a key, or should anything fail, the
// package goes through the session, as ever.

/** Where packages are, beside the internet relay: https://…/packages. */
export const packagesAddress = (): string => {
    const url = new URL(INTERNET_RELAY);
    url.protocol = url.protocol === "ws:" ? "http:" : "https:";
    url.pathname = "/packages";
    url.search = "";
    return url.toString();
};

/** Whether this page's sessions go through the internet relay (so packages can, too). */
export const sharesThroughCloud = (): boolean =>
    import.meta.env.VITE_RELAY_MODE === "internet" ||
    (import.meta.env.VITE_RELAY_MODE !== "local" && !isLocalHost(location.hostname));

const KEY = "teletronix:gm-upload-key";

/** The GM's upload key, kept in this browser (for every program). */
export function savedUploadKey(): string {
    try {
        return localStorage.getItem(KEY) ?? "";
    } catch {
        return "";
    }
}

export function rememberUploadKey(key: string): void {
    try {
        if (key) localStorage.setItem(KEY, key);
        else localStorage.removeItem(KEY);
    } catch {
        // not remembered
    }
}

/** An upload: its id there, and where players download it. */
export interface Uploaded {
    id: string;
    url: string;
}

/** Uploads the panel's package (an error says why it couldn't, as the relay put it). */
export async function uploadPackage(program: string, key: string): Promise<Uploaded> {
    const stored = program.startsWith(PACKAGE_PREFIX)
        ? await getPackage(program.slice(PACKAGE_PREFIX.length))
        : undefined;
    if (!stored) throw new Error("It isn't a package");
    const response = await fetch(packagesAddress(), {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: stored.file,
    });
    const answer = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!response.ok || !answer.id) throw new Error(answer.error ?? `${response.status}`);
    return { id: answer.id, url: `${packagesAddress()}/${answer.id}` };
}

/** Deletes an upload, once its session's over (the bucket deletes it a day after, anyway). */
export function deleteUpload(id: string, key: string): void {
    void fetch(`${packagesAddress()}/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${key}` },
        keepalive: true,
    }).catch(() => {});
}

/** Downloads a package, telling how far it's got (0 to 1). */
export async function downloadPackage(
    url: string,
    progress: (fraction: number) => void,
): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`${response.status}`);
    const size = Number(response.headers.get("Content-Length")) || 0;
    const reader = response.body.getReader();
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let got = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value as Uint8Array<ArrayBuffer>);
        got += value.length;
        if (size) progress(got / size);
    }
    return new Blob(parts);
}
