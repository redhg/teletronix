import { createReadStream } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";
import { Readable } from "node:stream";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

// Zip archives, as far as Teletronix packages (.ttx) need them: reading what Finder, Windows,
// `zip` and the like make (stored or deflated files, no encryption, no Zip64), and writing
// them. A stored file can be read in part, straight from the archive: a video, as a player
// seeks through it.

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;
/** Bit 0 of the flags: encrypted. Bit 11: the name is UTF-8. */
const ENCRYPTED = 1;
const UTF8 = 1 << 11;
const STORED = 0;
const DEFLATED = 8;
/** The most a 32-bit size or offset can be: beyond it, a zip needs Zip64. */
const MAX_32 = 0xffffffff;

export interface ZipEntry {
    /** Its path in the archive, with "/" between folders */
    name: string;
    /** 0: stored as is; 8: deflated */
    method: number;
    compressedSize: number;
    size: number;
    crc: number;
    /** Where its local header is */
    offset: number;
}

/** An archive opened for reading: its files, by name. */
export class ZipReader {
    readonly path: string;
    readonly entries: Map<string, ZipEntry>;
    private readonly file: FileHandle;

    // (fields written out: Node runs this file as it is, and its types are only stripped)
    private constructor(path: string, file: FileHandle, entries: Map<string, ZipEntry>) {
        this.path = path;
        this.file = file;
        this.entries = entries;
    }

    /** Opens an archive, reading its directory (an error if it isn't one it can read). */
    static async open(path: string): Promise<ZipReader> {
        const file = await open(path, "r");
        try {
            return new ZipReader(path, file, await readDirectory(file));
        } catch (error) {
            await file.close();
            throw error;
        }
    }

    close() {
        return this.file.close();
    }

    /** Where a file's data starts, after its local header (whose length varies). */
    private async dataStart(entry: ZipEntry): Promise<number> {
        const header = Buffer.alloc(30);
        await this.file.read(header, 0, 30, entry.offset);
        if (header.readUInt32LE(0) !== LOCAL_HEADER) throw new Error(`Damaged: ${entry.name}`);
        return entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    }

    /** A file's contents, whole (checked against its checksum). */
    async read(entry: ZipEntry): Promise<Buffer> {
        const start = await this.dataStart(entry);
        const raw = Buffer.alloc(entry.compressedSize);
        await this.file.read(raw, 0, entry.compressedSize, start);
        const data = entry.method === DEFLATED ? inflateRawSync(raw) : raw;
        if (data.length !== entry.size || crc32(data) !== entry.crc) {
            throw new Error(`Damaged: ${entry.name}`);
        }
        return data;
    }

    /**
     * Part of a file (inclusive), as a stream: straight from the archive for a stored one,
     * or from its contents, inflated, for a deflated one.
     */
    async stream(entry: ZipEntry, range?: { start: number; end: number }): Promise<Readable> {
        if (entry.method === STORED) {
            const start = await this.dataStart(entry);
            const from = range?.start ?? 0;
            const to = range?.end ?? entry.size - 1;
            return createReadStream(this.path, { start: start + from, end: start + to });
        }
        const data = await this.read(entry);
        return Readable.from([range ? data.subarray(range.start, range.end + 1) : data]);
    }
}

async function readDirectory(file: FileHandle): Promise<Map<string, ZipEntry>> {
    const { size } = await file.stat();
    // the end of the directory record: in the last 22 bytes, or before a comment of up to 64K
    const tail = Buffer.alloc(Math.min(size, 22 + 0xffff));
    await file.read(tail, 0, tail.length, size - tail.length);
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
        if (tail.readUInt32LE(i) === END_OF_DIRECTORY) {
            end = i;
            break;
        }
    }
    if (end < 0) throw new Error("Not a zip archive");
    const count = tail.readUInt16LE(end + 10);
    const directorySize = tail.readUInt32LE(end + 12);
    const directoryOffset = tail.readUInt32LE(end + 16);
    if (count === 0xffff || directoryOffset === MAX_32) {
        throw new Error("A Zip64 archive (over 4 GB, or 65,535 files): too big to read");
    }
    const directory = Buffer.alloc(directorySize);
    await file.read(directory, 0, directorySize, directoryOffset);

    const entries = new Map<string, ZipEntry>();
    let at = 0;
    for (let i = 0; i < count; i++) {
        if (directory.readUInt32LE(at) !== CENTRAL_HEADER) throw new Error("A damaged archive");
        const flags = directory.readUInt16LE(at + 8);
        const method = directory.readUInt16LE(at + 10);
        const nameLength = directory.readUInt16LE(at + 28);
        const extraLength = directory.readUInt16LE(at + 30);
        const commentLength = directory.readUInt16LE(at + 32);
        const rawName = directory.subarray(at + 46, at + 46 + nameLength);
        // (read as UTF-8 whether or not it's marked so: names not marked are meant to be in
        // the old DOS code page, but tools write UTF-8 in practice, and ASCII reads the same)
        const name = rawName.toString("utf8").replaceAll("\\", "/");
        const entry: ZipEntry = {
            name,
            method,
            crc: directory.readUInt32LE(at + 16),
            compressedSize: directory.readUInt32LE(at + 20),
            size: directory.readUInt32LE(at + 24),
            offset: directory.readUInt32LE(at + 42),
        };
        at += 46 + nameLength + extraLength + commentLength;
        if (name.endsWith("/")) continue;
        if (flags & ENCRYPTED) throw new Error(`Encrypted: ${name}`);
        if (method !== STORED && method !== DEFLATED) {
            throw new Error(`Compressed in a way it can't read: ${name}`);
        }
        entries.set(name, entry);
    }
    return entries;
}

/** A file to put in an archive: its path in it, its contents, and whether to compress it. */
export interface ZipInput {
    name: string;
    data: Buffer;
    /** False for what's compressed already (images, sound, video): stored, it can be read in part */
    compress: boolean;
}

/** A DOS date and time, as zips keep them: now. */
function dosTime(date = new Date()) {
    return {
        time:
            (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
        date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
}

/** Writes an archive of these files, one at a time. */
export async function writeZip(path: string, files: ZipInput[]): Promise<void> {
    if (files.length >= 0xffff) throw new Error("Too many files for a zip archive");
    const out = await open(path, "w");
    const { time, date } = dosTime();
    const central: Buffer[] = [];
    let offset = 0;
    try {
        for (const file of files) {
            const name = Buffer.from(file.name, "utf8");
            const deflated = file.compress ? deflateRawSync(file.data) : null;
            // (stored, if compressing doesn't make it smaller)
            const data = deflated && deflated.length < file.data.length ? deflated : file.data;
            const method = data === file.data ? STORED : DEFLATED;
            const crc = crc32(file.data);
            if (offset + data.length > MAX_32 || file.data.length > MAX_32) {
                throw new Error("Too big for a zip archive (over 4 GB)");
            }
            const local = Buffer.alloc(30);
            local.writeUInt32LE(LOCAL_HEADER, 0);
            local.writeUInt16LE(20, 4); // version needed: 2.0
            local.writeUInt16LE(UTF8, 6);
            local.writeUInt16LE(method, 8);
            local.writeUInt16LE(time, 10);
            local.writeUInt16LE(date, 12);
            local.writeUInt32LE(crc, 14);
            local.writeUInt32LE(data.length, 18);
            local.writeUInt32LE(file.data.length, 22);
            local.writeUInt16LE(name.length, 26);
            await out.write(Buffer.concat([local, name]));
            await out.write(data);

            const header = Buffer.alloc(46);
            header.writeUInt32LE(CENTRAL_HEADER, 0);
            header.writeUInt16LE(20, 4); // made by: 2.0
            header.writeUInt16LE(20, 6);
            header.writeUInt16LE(UTF8, 8);
            header.writeUInt16LE(method, 10);
            header.writeUInt16LE(time, 12);
            header.writeUInt16LE(date, 14);
            header.writeUInt32LE(crc, 16);
            header.writeUInt32LE(data.length, 20);
            header.writeUInt32LE(file.data.length, 24);
            header.writeUInt16LE(name.length, 28);
            header.writeUInt32LE(offset, 42);
            central.push(header, name);
            offset += 30 + name.length + data.length;
        }
        const directory = Buffer.concat(central);
        const end = Buffer.alloc(22);
        end.writeUInt32LE(END_OF_DIRECTORY, 0);
        end.writeUInt16LE(files.length, 8);
        end.writeUInt16LE(files.length, 10);
        end.writeUInt32LE(directory.length, 12);
        end.writeUInt32LE(offset, 16);
        await out.write(Buffer.concat([directory, end]));
    } finally {
        await out.close();
    }
}
