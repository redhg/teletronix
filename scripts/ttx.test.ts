import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makePackage, openPackage, referencedFiles } from "./ttx.ts";
import { writeZip, ZipReader } from "./zip.ts";

const FIXTURES = new URL("./fixtures/", import.meta.url).pathname;
let folder = "";

beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), "teletronix-ttx-"));
});
afterAll(async () => {
    await rm(folder, { recursive: true, force: true });
});

const text = async (stream: AsyncIterable<unknown>) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
};

describe("a zip archive", () => {
    it("is written and read back: stored, deflated, and named in any script", async () => {
        const path = join(folder, "round.zip");
        const long = "STATIC ".repeat(500);
        await writeZip(path, [
            { name: "notes.txt", data: Buffer.from(long), compress: true },
            { name: "images/北極星.png", data: Buffer.from("PNGDATA"), compress: false },
            // (compressing what doesn't get smaller stores it)
            { name: "tiny.txt", data: Buffer.from("x"), compress: true },
        ]);
        const zip = await ZipReader.open(path);
        try {
            expect([...zip.entries.keys()]).toEqual(["notes.txt", "images/北極星.png", "tiny.txt"]);
            const notes = zip.entries.get("notes.txt");
            expect(notes?.method).toBe(8);
            expect(notes && notes.compressedSize < 200).toBe(true);
            expect(notes && (await zip.read(notes)).toString()).toBe(long);
            const image = zip.entries.get("images/北極星.png");
            expect(image?.method).toBe(0);
            expect(image && (await text(await zip.stream(image, { start: 3, end: 6 })))).toBe(
                "DATA",
            );
            expect(zip.entries.get("tiny.txt")?.method).toBe(0);
        } finally {
            await zip.close();
        }
    });

    it("reads what other tools make: Finder's, and one streamed with descriptors", async () => {
        const finder = await ZipReader.open(join(FIXTURES, "finder.zip"));
        expect(finder.entries.has("heist/heist.json")).toBe(true);
        // (folders aren't files)
        expect(finder.entries.has("heist/")).toBe(false);
        await finder.close();
        const streamed = await ZipReader.open(join(FIXTURES, "streamed.zip"));
        const json = streamed.entries.get("heist.json");
        expect(json && JSON.parse((await streamed.read(json)).toString()).config.name).toBe(
            "Heist",
        );
        await streamed.close();
    });

    it("won't read what isn't one, or is damaged", async () => {
        const fake = join(folder, "fake.zip");
        await writeFile(fake, "not a zip at all");
        await expect(ZipReader.open(fake)).rejects.toThrow("Not a zip archive");

        const path = join(folder, "damaged.zip");
        await writeZip(path, [{ name: "a.txt", data: Buffer.from("HELLO"), compress: false }]);
        const bytes = await readFile(path);
        // (the contents changed, but not its checksum)
        bytes.write("J", bytes.indexOf("HELLO"));
        await writeFile(path, bytes);
        const zip = await ZipReader.open(path);
        const entry = zip.entries.get("a.txt");
        await expect(entry && zip.read(entry)).rejects.toThrow("Damaged: a.txt");
        await zip.close();
    });
});

describe("a package", () => {
    it("is found in a zip of a folder, past macOS's extras", async () => {
        const opened = await openPackage(join(FIXTURES, "finder.zip"));
        try {
            expect(opened.program.name).toBe("heist/heist.json");
            expect(opened.entry("images/vault.svg")?.name).toBe("heist/images/vault.svg");
            expect(opened.entry(".DS_Store")).toBeUndefined();
            expect(opened.files()).toEqual(["images/vault.svg"]);
        } finally {
            await opened.reader.close();
        }
    });

    it("says what's wrong with one it can't play", async () => {
        const none = join(folder, "none.ttx");
        await writeZip(none, [{ name: "images/a.png", data: Buffer.from("A"), compress: false }]);
        await expect(openPackage(none)).rejects.toThrow("There's no program in it");

        const several = join(folder, "several.ttx");
        const program = Buffer.from('{"config":{"name":"X"}}');
        await writeZip(several, [
            { name: "a.json", data: program, compress: true },
            { name: "b.json", data: program, compress: true },
        ]);
        await expect(openPackage(several)).rejects.toThrow("several programs");
        // (unless one is named as the package is)
        const named = join(folder, "b.ttx");
        await writeFile(named, await readFile(several));
        const opened = await openPackage(named);
        expect(opened.program.name).toBe("b.json");
        await opened.reader.close();

        const broken = join(folder, "broken.ttx");
        await writeZip(broken, [{ name: "x.json", data: Buffer.from("{ nope"), compress: true }]);
        await expect(openPackage(broken)).rejects.toThrow(SyntaxError);
    });

    it("is made of a program and the files it names, each once", async () => {
        const program = {
            config: { name: "Heist", ambience: "drone" },
            sounds: { drone: { src: "data/audio/drone.mp3" } },
            screens: {
                home: {
                    content: [
                        { type: "bitmap", src: "data/images/vault.png", alt: "VAULT" },
                        { type: "bitmap", src: "data/images/vault.png", alt: "AGAIN" },
                        { type: "video", src: "data/video/lost.mp4" },
                        "Text that mentions data/images/vault.png isn't a file.",
                        { type: "bitmap", src: "https://example.com/x.png", alt: "ELSEWHERE" },
                    ],
                },
            },
        };
        expect(referencedFiles(program)).toEqual([
            "data/audio/drone.mp3",
            "data/images/vault.png",
            "data/video/lost.mp4",
        ]);
        const out = join(folder, "heist.ttx");
        const files: Record<string, string> = {
            "data/audio/drone.mp3": "MP3",
            "data/images/vault.png": "PNG",
        };
        const result = await makePackage(
            { name: "heist", text: JSON.stringify(program) },
            async (path) => (files[path] ? Buffer.from(files[path]) : null),
            out,
        );
        expect(result).toEqual({
            files: ["data/audio/drone.mp3", "data/images/vault.png"],
            missing: ["data/video/lost.mp4"],
        });
        const opened = await openPackage(out);
        try {
            expect(opened.program.name).toBe("heist.json");
            expect(opened.files().sort()).toEqual(["audio/drone.mp3", "images/vault.png"]);
            // (what's compressed already is stored, to read in part)
            expect(opened.entry("audio/drone.mp3")?.method).toBe(0);
        } finally {
            await opened.reader.close();
        }
    });
});
