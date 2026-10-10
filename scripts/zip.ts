import { createReadStream } from "node:fs";
import { type FileHandle, open } from "node:fs/promises";
import { Readable } from "node:stream";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import {
    CENTRAL_HEADER,
    DEFLATED,
    dataStart,
    END_OF_DIRECTORY,
    END_SIZE,
    findDirectory,
    LOCAL_HEADER,
    MAX_32,
    MAX_COMMENT,
    parseDirectory,
    STORED,
    UTF8,
    type ZipEntry,
} from "../src/package/format.ts";

export type { ZipEntry };

// Zip archives in Node, as far as Teletronix packages (.ttx) need them (see
// src/package/format.ts, which the browser's reader shares): reading what Finder, Windows,
// `zip` and the like make, and writing them. A stored file can be read in part, straight from the archive: a video, as a player
// seeks through it.

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
        return dataStart(entry, header);
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
    const tail = Buffer.alloc(Math.min(size, END_SIZE + MAX_COMMENT));
    await file.read(tail, 0, tail.length, size - tail.length);
    const where = findDirectory(tail);
    const directory = Buffer.alloc(where.size);
    await file.read(directory, 0, where.size, where.offset);
    return parseDirectory(directory, where.count);
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
