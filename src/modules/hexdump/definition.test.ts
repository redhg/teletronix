import { describe, expect, it } from "vitest";
import {
    autoscrollStep,
    bytesPerRow,
    type HexdumpElement,
    hexBytes,
    highlighted,
    moveCursor,
    rowWidth,
    statusLine,
    utf8,
} from "./definition.ts";

const dump = (overrides: Partial<HexdumpElement> = {}): HexdumpElement => ({
    id: "screen#0",
    type: "hexdump",
    offset: 0,
    ascii: true,
    lowercase: false,
    statusBar: false,
    autoscroll: false,
    loop: true,
    speed: 12,
    ...overrides,
});

describe("hex dump bytes", () => {
    it("are text as UTF-8", () => {
        expect([...utf8("Aé€😀")]).toEqual([
            0x41, 0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80,
        ]);
        expect([...hexBytes(dump({ text: "HI" }))]).toEqual([0x48, 0x49]);
    });

    it("are random, the same each time, with the text hidden among them", () => {
        const secret = dump({ size: 64, text: "KEY", at: 10 });
        const bytes = hexBytes(secret);
        expect(bytes).toHaveLength(64);
        expect([...bytes.slice(10, 13)]).toEqual([...utf8("KEY")]);
        expect(hexBytes(secret)).toEqual(bytes);
        // another element gets other bytes
        expect(hexBytes({ ...secret, id: "screen#1" })).not.toEqual(bytes);
    });

    it("keep the text inside, however near the end it's put", () => {
        const bytes = hexBytes(dump({ size: 8, text: "ABCD", at: 7 }));
        expect([...bytes.slice(4)]).toEqual([...utf8("ABCD")]);
    });

    it("are a file's, once it has loaded", () => {
        const file = Uint8Array.from([1, 2, 3]);
        expect(hexBytes(dump({ src: "x.bin" }), file)).toBe(file);
        expect(hexBytes(dump({ src: "x.bin" }))).toHaveLength(0);
    });
});

describe("hex dump rows", () => {
    it("hold as many bytes as fit", () => {
        expect(rowWidth(16, true)).toBe(77);
        expect(bytesPerRow(dump(), 80)).toBe(16);
        expect(bytesPerRow(dump(), 60)).toBe(8);
        expect(bytesPerRow(dump(), 30)).toBe(4);
        expect(bytesPerRow(dump({ ascii: false }), 60)).toBe(16);
        expect(bytesPerRow(dump({ perRow: 4 }), 200)).toBe(4);
    });
});

describe("hex dump highlights", () => {
    it("mark every place some text appears, and ranges", () => {
        const bytes = utf8("ABAB--AB");
        const marks = highlighted(dump({ highlight: ["AB", { from: 4, to: 5 }] }), bytes);
        expect([...marks].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        expect([...highlighted(dump({ highlight: [{ from: 6, to: 99 }] }), bytes)]).toEqual([6, 7]);
    });
});

describe("the hex dump's cursor", () => {
    // 20 bytes, 8 to a row, 2 rows showing
    const move = (key: string, from: number) => moveCursor(key, from, 20, 8, 2);

    it("moves by bytes, rows and pages", () => {
        expect(move("ArrowRight", 3)).toBe(4);
        expect(move("ArrowDown", 3)).toBe(11);
        expect(move("PageDown", 1)).toBe(17);
        expect(move("End", 3)).toBe(19);
        expect(move("Home", 13)).toBe(0);
        expect(move("x", 3)).toBeNull();
    });

    it("stops at the ends, keeping to its column when it can", () => {
        expect(move("ArrowLeft", 0)).toBe(0);
        expect(move("ArrowUp", 5)).toBe(5);
        expect(move("ArrowDown", 14)).toBe(19);
        expect(move("ArrowDown", 10)).toBe(18);
        expect(move("ArrowRight", 19)).toBe(19);
    });

    it("shows where it is in the status line", () => {
        const bytes = Uint8Array.from([0xab, 0xcd]);
        const status = dump({ offset: 0xff, status: "{offset} {byte} {size}", lowercase: true });
        expect(statusLine(status, bytes, 1)).toBe("00000100 cd 2");
    });
});

describe("autoscroll", () => {
    // 40 bytes, 8 to a row (5 rows), 2 rows showing
    const step = (cursor: number, top: number, loop = true, stopAt?: number) =>
        autoscrollStep(cursor, 40, 8, top, 2, loop, stopAt);

    it("moves the cursor down a row, the view following", () => {
        expect(step(3, 0)).toEqual({ cursor: 11, top: 0, stop: false });
        expect(step(11, 0)).toEqual({ cursor: 19, top: 1, stop: false });
    });

    it("starts again at the top, or stops at the end", () => {
        expect(step(35, 3)).toEqual({ cursor: 3, top: 0, stop: false });
        expect(step(35, 3, false)).toEqual({ cursor: 35, top: 3, stop: true });
    });

    it("stops with the cursor on a byte once it's in the top half of the view", () => {
        // 160 bytes (20 rows), 6 showing: byte 100 is in row 12
        const far = (cursor: number, top: number) =>
            autoscrollStep(cursor, 160, 8, top, 6, true, 100);
        // row 12 comes into view at the bottom (rows 7 to 12), but it keeps going
        expect(far(88, 5)).toEqual({ cursor: 96, top: 7, stop: false });
        // until the view is rows 10 to 15, with row 12 in its top half
        expect(far(112, 9)).toEqual({ cursor: 100, top: 10, stop: true });
    });

    it("moves up too, round to the bottom", () => {
        const up = (cursor: number, top: number, loop = true) =>
            autoscrollStep(cursor, 40, 8, top, 2, loop, undefined, -1);
        expect(up(19, 1)).toEqual({ cursor: 11, top: 1, stop: false });
        expect(up(11, 1)).toEqual({ cursor: 3, top: 0, stop: false });
        expect(up(3, 0)).toEqual({ cursor: 35, top: 3, stop: false });
        expect(up(3, 0, false)).toEqual({ cursor: 3, top: 0, stop: true });
        // a short last row: round to its last byte
        expect(autoscrollStep(7, 36, 8, 0, 2, true, undefined, -1).cursor).toBe(35);
    });

    it("going up, stops once a byte is in the bottom half of the view", () => {
        // 160 bytes (20 rows), 6 showing: byte 100 is in row 12
        const far = (cursor: number, top: number) =>
            autoscrollStep(cursor, 160, 8, top, 6, true, 100, -1);
        // row 12 comes into view at the top (rows 12 to 17), but it keeps going
        expect(far(100, 13)).toEqual({ cursor: 92, top: 11, stop: false });
        expect(far(84, 10)).toEqual({ cursor: 100, top: 9, stop: true });
    });

    it("stops at a byte near the end as soon as it's in view", () => {
        // byte 30 is in row 3; with the last row (4) in view, that's as far as it can go
        expect(step(19, 1, true, 30)).toEqual({ cursor: 27, top: 2, stop: false });
        expect(step(27, 2, true, 30)).toEqual({ cursor: 30, top: 3, stop: true });
    });
});
