import { getPackage, PACKAGE_PREFIX } from "../package/store.ts";

// Sharing the GM's package (.ttx) with players' windows that don't have it, through the
// session: nothing's kept anywhere between. A window opened with a package's address it hasn't
// got (e.g. from the GM's QR code) asks the panel about it; the panel offers it (its name and
// size); once the player accepts, the panel sends it, in pieces, to that window alone.

/** The largest package shared this way. */
export const MAX_SHARED = 50 * 1024 * 1024;
/** Each piece's bytes: as base64, with its message around it, inside the relay's 64 KB. */
const PIECE = 45_000;
/** How much may wait to go out before the panel waits for it to (bytes). */
const BACKLOG = 256 * 1024;

/** Bytes as base64, a block at a time (a whole package at once is too much for one call). */
export function toBase64(bytes: Uint8Array): string {
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(text);
}

export const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
    Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

/** "6.8 MB", for a package's size. */
export const sizeText = (bytes: number) =>
    bytes < 1024 * 1024
        ? `${Math.max(1, Math.round(bytes / 1024))} KB`
        : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** The panel's answer about a package: its offer, or why it can't share it. */
export async function answerFor(
    program: string,
    wanted: string,
): Promise<
    | { type: "package-offer"; package: string; fileName: string; size: number }
    | { type: "package-unavailable"; package: string; reason: "not-shared" | "too-big" }
> {
    const stored =
        program === `${PACKAGE_PREFIX}${wanted}`
            ? await getPackage(wanted).catch(() => undefined)
            : undefined;
    if (!stored) return { type: "package-unavailable", package: wanted, reason: "not-shared" };
    if (stored.file.size > MAX_SHARED) {
        return { type: "package-unavailable", package: wanted, reason: "too-big" };
    }
    return {
        type: "package-offer",
        package: wanted,
        fileName: stored.fileName,
        size: stored.file.size,
    };
}

/** Where a package is going: one players' window, through the session. */
export interface ShareTarget {
    sendTo(player: string, message: object): void;
    buffered(): number;
}

/**
 * Sends the panel's package to one players' window, in pieces, as fast as the connection
 * takes them; `progress` hears each piece's going (sent, out of how many).
 */
export async function sendPackage(
    link: ShareTarget,
    player: string,
    program: string,
    progress: (sent: number, count: number) => void = () => {},
): Promise<void> {
    const id = program.slice(PACKAGE_PREFIX.length);
    const stored = program.startsWith(PACKAGE_PREFIX) ? await getPackage(id) : undefined;
    if (!stored || stored.file.size > MAX_SHARED) return;
    const bytes = new Uint8Array(await stored.file.arrayBuffer());
    const count = Math.max(1, Math.ceil(bytes.length / PIECE));
    for (let index = 0; index < count; index++) {
        while (link.buffered() > BACKLOG) await new Promise((resolve) => setTimeout(resolve, 50));
        link.sendTo(player, {
            type: "package-piece",
            id: `${id}:${index}`,
            package: id,
            index,
            count,
            data: toBase64(bytes.subarray(index * PIECE, (index + 1) * PIECE)),
        });
        progress(index + 1, count);
    }
}

/** A package arriving in pieces: whole once every piece is in. */
export class PackageArrival {
    private readonly pieces: (Uint8Array<ArrayBuffer> | undefined)[] = [];
    private got = 0;
    count = 0;

    /** Takes a piece; true once the package is whole. */
    take(index: number, count: number, data: string): boolean {
        if (!Number.isInteger(index) || index < 0 || index >= count || count > 10_000) return false;
        this.count = count;
        if (!this.pieces[index]) {
            this.pieces[index] = fromBase64(data);
            this.got++;
        }
        return this.got === count;
    }

    /** How much has arrived: 0 to 1. */
    get progress(): number {
        return this.count ? this.got / this.count : 0;
    }

    /** The whole package. */
    blob(): Blob {
        return new Blob(
            this.pieces.filter((piece): piece is Uint8Array<ArrayBuffer> => piece !== undefined),
        );
    }
}
