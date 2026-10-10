// The packages opened in this browser (dropped on the page, or chosen), kept in IndexedDB so a
// reload, the GM's panel in another window, and playing offline all have them. They play as
// `?data=ttx:<name>`. The latest few are kept; opening one of the same name replaces it.

const DATABASE = "teletronix-packages";
const STORE = "packages";
/** How many are kept: the oldest go as new ones come. */
const KEEP = 10;

/** The prefix of a package's name in an address: `?data=ttx:heist`. */
export const PACKAGE_PREFIX = "ttx:";

export interface StoredPackage {
    /** Its name, as it plays: `?data=ttx:<id>` */
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
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () =>
            request.result
                .createObjectStore(STORE, { keyPath: "id" })
                .createIndex("added", "added");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** Runs a request against the store, and closes the database after. */
async function run<T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    const db = await database();
    try {
        return await new Promise<T>((resolve, reject) => {
            const transaction = db.transaction(STORE, mode);
            const request = work(transaction.objectStore(STORE));
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
    const kept = await run("readonly", (store) => store.get(id) as IDBRequest<Kept | undefined>);
    if (!kept) return undefined;
    const { bytes, ...rest } = kept;
    return { ...rest, file: new Blob([bytes]) };
}

/** Keeps a package (replacing one of the same name), letting the oldest go past KEEP. */
export async function putPackage({ file, ...item }: StoredPackage): Promise<void> {
    const kept: Kept = { ...item, bytes: await file.arrayBuffer() };
    await run("readwrite", (store) => store.put(kept));
    // (by their names alone, oldest first, without reading them)
    const ids = await run("readonly", (store) => store.index("added").getAllKeys());
    for (const old of ids.slice(0, Math.max(0, ids.length - KEEP))) {
        await run("readwrite", (store) => store.delete(old));
    }
}
