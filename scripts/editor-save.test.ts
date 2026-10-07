import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSaver } from "./editor-save.ts";

let server: Server;
let base: string;
let folder: string;

beforeEach(async () => {
    folder = mkdtempSync(join(tmpdir(), "teletronix-save-"));
    const saver = createSaver(pathToFileURL(`${folder}/`));
    server = createServer((req, res) =>
        saver(req, res, () => {
            res.statusCode = 404;
            res.end();
        }),
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(folder, { recursive: true });
});

const put = (path: string, body: string) => fetch(`${base}${path}`, { method: "PUT", body });

describe("the editor's save endpoint", () => {
    it("says saving is possible, and writes a program into the folder", async () => {
        expect((await fetch(`${base}/__teletronix/save`)).status).toBe(204);
        const json = '{\n    "config": { "name": "T" }\n}\n';
        expect((await put("/__teletronix/save/my-game.json", json)).status).toBe(204);
        expect(readFileSync(join(folder, "my-game.json"), "utf8")).toBe(json);
    });

    it("writes only JSON, and only into the folder", async () => {
        expect((await put("/__teletronix/save/game.json", "not json")).status).toBe(400);
        expect((await put("/__teletronix/save/..%2Fescape.json", "{}")).status).toBe(404);
        expect((await put("/__teletronix/save/.hidden.json", "{}")).status).toBe(404);
        expect((await put("/__teletronix/save", "{}")).status).toBe(405);
    });
});

describe("the editor's audio list", () => {
    it("lists the audio files in the folder's audio folder, as programs name them", async () => {
        const { mkdirSync, writeFileSync } = await import("node:fs");
        expect(await (await fetch(`${base}/__teletronix/audio`)).json()).toEqual([]);
        mkdirSync(join(folder, "audio", "ship"), { recursive: true });
        for (const name of ["drone.mp3", "notes.txt", "ship/alarm.ogg"]) {
            writeFileSync(join(folder, "audio", name), "");
        }
        expect(await (await fetch(`${base}/__teletronix/audio`)).json()).toEqual([
            "data/audio/drone.mp3",
            "data/audio/ship/alarm.ogg",
        ]);
    });
});
