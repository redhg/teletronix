import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listPrograms } from "./programs.ts";
import { fileUnder, parseRange, startAppServer } from "./server.ts";

let folder = "";
let app = "";
let programs = "";
let base = "";
let close = () => {};

beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), "teletronix-desktop-"));
    app = join(folder, "dist");
    programs = join(folder, "programs");
    await mkdir(join(app, "data", "video"), { recursive: true });
    await mkdir(join(programs, "images"), { recursive: true });
    await writeFile(join(app, "index.html"), "<!doctype html><title>Teletronix</title>");
    await writeFile(join(app, "sw.js"), "// a service worker");
    await writeFile(join(app, "data", "sample.json"), '{"config":{"name":"Built-in sample"}}');
    await writeFile(join(app, "data", "tape7.json"), '{"config":{"name":"Tape 7"}}');
    await writeFile(join(app, "data", "video", "tape.mp4"), "0123456789");
    await writeFile(join(programs, "sample.json"), '{"config":{"name":"My sample"}}');
    await writeFile(join(programs, "heist.json"), '{"config":{"name":"Heist"}}');
    await writeFile(join(programs, "notes.json"), '{"not":"a program"}');
    await writeFile(join(programs, "images", "map.png"), "PNG");
    await writeFile(join(folder, "secret.txt"), "not for the network");
    const { server } = await startAppServer({ app, programs }, 0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
});

afterAll(async () => {
    close();
    await rm(folder, { recursive: true, force: true });
});

const get = (path: string, headers: Record<string, string> = {}) => fetch(base + path, { headers });

describe("the desktop app's server", () => {
    it("serves the app, at its own address and any other that isn't a file", async () => {
        for (const path of ["/", "/index.html", "/somewhere"]) {
            const response = await get(path);
            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain("text/html");
            expect(await response.text()).toContain("<title>Teletronix</title>");
        }
        expect((await get("/missing.png")).status).toBe(404);
    });

    it("serves the player's own programs and files over the built-in ones", async () => {
        expect(await (await get("/data/sample.json")).json()).toEqual({
            config: { name: "My sample" },
        });
        expect(await (await get("/data/tape7.json")).json()).toEqual({
            config: { name: "Tape 7" },
        });
        const image = await get("/data/images/map.png");
        expect(image.headers.get("content-type")).toBe("image/png");
        expect(await image.text()).toBe("PNG");
    });

    it("serves part of a file, as a video player asks", async () => {
        const part = await get("/data/video/tape.mp4", { Range: "bytes=2-5" });
        expect(part.status).toBe(206);
        expect(part.headers.get("content-range")).toBe("bytes 2-5/10");
        expect(part.headers.get("content-type")).toBe("video/mp4");
        expect(await part.text()).toBe("2345");
        const end = await get("/data/video/tape.mp4", { Range: "bytes=-3" });
        expect(await end.text()).toBe("789");
        expect((await get("/data/video/tape.mp4", { Range: "bytes=20-" })).status).toBe(416);
        const whole = await get("/data/video/tape.mp4");
        expect(whole.headers.get("accept-ranges")).toBe("bytes");
        expect(await whole.text()).toBe("0123456789");
    });

    it("leaves the service worker out", async () => {
        expect((await get("/sw.js")).status).toBe(404);
        expect((await get("/registerSW.js")).status).toBe(404);
    });

    it("keeps to its folders", async () => {
        for (const path of [
            "/../secret.txt",
            "/data/../../secret.txt",
            "/data/%2e%2e/%2e%2e/secret.txt",
        ]) {
            const response = await get(path);
            expect(await response.text()).not.toContain("not for the network");
        }
        expect(fileUnder("/a/b", "../c")).toBeNull();
        expect(fileUnder("/a/b", "%2e%2e/c")).toBeNull();
        expect(fileUnder("/a/b", "%E0%A4%A")).toBeNull();
        expect(fileUnder("/a/b", "c/d.png")).toBe(join("/a/b", "c/d.png"));
    });

    it("only takes files it can serve", async () => {
        const response = await fetch(`${base}/data/sample.json`, { method: "POST" });
        expect(response.status).toBe(405);
    });

    it("has the relay and the editor's saving", async () => {
        expect((await get("/remote/addresses")).status).toBe(200);
        // (from this computer, saving is possible)
        expect((await get("/__teletronix/save")).status).toBe(204);
        expect(await (await get("/__teletronix/files/images")).json()).toEqual([
            "data/images/map.png",
        ]);
    });
});

describe("parsing a range", () => {
    it("reads a start and end, an open end, or the last few bytes", () => {
        expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
        expect(parseRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
        expect(parseRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
        expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
        expect(parseRange("bytes=1000-", 1000)).toBe("unsatisfiable");
        expect(parseRange(undefined, 1000)).toBeNull();
        expect(parseRange("bytes=0-1,5-9", 1000)).toBeNull();
    });
});

describe("the Programs menu", () => {
    it("lists the player's programs first, then the built-in ones not replaced, by title", async () => {
        expect(await listPrograms(join(app, "data"), programs)).toEqual([
            { name: "heist", title: "Heist", own: true },
            { name: "sample", title: "My sample", own: true },
            { name: "tape7", title: "Tape 7", own: false },
        ]);
    });
});
