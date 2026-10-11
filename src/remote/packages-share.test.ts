import { describe, expect, it } from "vitest";
import { fromBase64, PackageArrival, sizeText, toBase64 } from "./packages-share.ts";

describe("sharing a package in pieces", () => {
    it("goes to base64 and back, whatever the bytes, however many", () => {
        const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7919) % 256);
        expect(fromBase64(toBase64(bytes))).toEqual(bytes);
        expect(fromBase64(toBase64(new Uint8Array()))).toEqual(new Uint8Array());
    });

    it("comes together from pieces in any order, each once", async () => {
        const arrival = new PackageArrival();
        const piece = (text: string) => toBase64(new TextEncoder().encode(text));
        expect(arrival.take(2, 3, piece("C"))).toBe(false);
        expect(arrival.take(0, 3, piece("A"))).toBe(false);
        expect(arrival.take(0, 3, piece("A"))).toBe(false);
        expect(arrival.progress).toBeCloseTo(2 / 3);
        expect(arrival.take(1, 3, piece("B"))).toBe(true);
        expect(await arrival.blob().text()).toBe("ABC");
        // (nothing out of range is taken)
        expect(new PackageArrival().take(5, 3, piece("X"))).toBe(false);
    });

    it("names a package's size as people read it", () => {
        expect(sizeText(512)).toBe("1 KB");
        expect(sizeText(240_000)).toBe("234 KB");
        expect(sizeText(6_821_342)).toBe("6.5 MB");
    });
});
