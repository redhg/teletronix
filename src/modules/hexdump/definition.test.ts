import { describe, expect, it } from "vitest";
import {
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
