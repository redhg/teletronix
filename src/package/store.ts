// The packages opened in this browser (dropped on the page, chosen, or shared by a GM), kept in
// IndexedDB so a reload, the GM's panel in another window, and playing offline all have them.
// They play as `?data=ttx:<id>`, the id made from their contents. The latest few are kept.
//
// Each has a listing too (its title, where it came from, when), kept apart from its bytes, so
// the start page can list them without reading any.

const DATABASE = "teletronix-packages";
const STORE = "packages";
const LISTINGS = "listings";
/** How many are kept: the oldest go as new ones come. */
const KEEP = 10;

/** The prefix of a package's id in an address: `?data=ttx:0nqmm8fa1t2`. */
export const PACKAGE_PREFIX = "ttx:";

/** What the start page lists of a package. */
export interface PackageListing {
    /** Its id, as it plays: `?data=ttx:<id>` */
    id: string;
    /** Its program's name (config.name) */
    title?: string;
    /**
     * How it got here: opened in this browser, or shared by a GM, whose players' screens
     * mustn't show its name (it could give something away)
     */
    from: "opened" | "session";
    /** When (ms) */
    added: number;
}

export interface StoredPackage {
    /** Its id, as it plays: `?data=ttx:<id>` */
    id: string;
    /** Its file's name, e.g. "Heist.ttx" */
    fileName: string;
    file: Blob;
    /** When it was opened (ms) */
    added: number;
}

/**
 * As it's kept: its file's bytes, rather than the file (Safari won't keep a Blob in a private
 * window, nor in WebKit's tests).
 */
type Kept = Omit<StoredPackage, "file"> & { bytes: ArrayBuffer };

function database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 2);
        request.onupgradeneeded = (event) => {
            const db = request.result;
            if (event.oldVersion < 1) {
                db.createObjectStore(STORE, { keyPath: "id" }).createIndex("added", "added");
            }
            // (packages kept before listings have none, and aren't listed)
            if (event.oldVersion < 2) db.createObjectStore(LISTINGS, { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** Runs requests against the stores, in one transaction, and closes the database after. */
async function run<T>(
    mode: IDBTransactionMode,
    work: (stores: { packages: IDBObjectStore; listings: IDBObjectStore }) => IDBRequest<T>,
): Promise<T> {
    const db = await database();
    try {
        return await new Promise<T>((resolve, reject) => {
            const transaction = db.transaction([STORE, LISTINGS], mode);
            const request = work({
                packages: transaction.objectStore(STORE),
                listings: transaction.objectStore(LISTINGS),
            });
            const failed = () =>
                reject(transaction.error ?? new Error("This browser's storage wouldn't keep it"));
            transaction.oncomplete = () => resolve(request.result);
            transaction.onerror = failed;
            transaction.onabort = failed;
        });
    } finally {
        db.close();
    }
}

export async function getPackage(id: string): Promise<StoredPackage | undefined> {
    const kept = await run(
        "readonly",
        ({ packages }) => packages.get(id) as IDBRequest<Kept | undefined>,
    );
    if (!kept) return undefined;
    const { bytes, ...rest } = kept;
    return { ...rest, file: new Blob([bytes]) };
}

/** The packages kept here, the latest first, without their bytes. */
export async function listPackages(): Promise<PackageListing[]> {
    const listings = await run(
        "readonly",
        ({ listings }) => listings.getAll() as IDBRequest<PackageListing[]>,
    );
    return listings.sort((a, b) => b.added - a.added);
}

/**
 * Keeps a package (replacing one with the same id), with its listing, letting the oldest go
 * past KEEP.
 */
export async function putPackage(
    { file, ...item }: StoredPackage,
    listing: Pick<PackageListing, "title" | "from"> = { from: "opened" },
): Promise<void> {
    const kept: Kept = { ...item, bytes: await file.arrayBuffer() };
    await run("readwrite", ({ packages, listings }) => {
        listings.put({ id: item.id, added: item.added, ...listing } satisfies PackageListing);
        return packages.put(kept);
    });
    // (by their ids alone, oldest first, without reading them)
    const ids = await run("readonly", ({ packages }) => packages.index("added").getAllKeys());
    for (const old of ids.slice(0, Math.max(0, ids.length - KEEP))) {
        await run("readwrite", ({ packages, listings }) => {
            listings.delete(old);
            return packages.delete(old);
        });
    }
}
