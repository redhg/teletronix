// The parts of opentype.js (https://opentype.js.org, MIT) that scripts/symbols-font.ts uses:
// its own types are for an older version, and it's CommonJS, imported as a default export.
declare module "opentype.js" {
    class Path {
        moveTo(x: number, y: number): void;
        lineTo(x: number, y: number): void;
        close(): void;
    }
    class Glyph {
        constructor(options: { name: string; unicode?: number; advanceWidth: number; path: Path });
    }
    interface ParsedFont {
        unitsPerEm: number;
        ascender: number;
        descender: number;
        tables: { hhea: { lineGap: number } };
        charToGlyphIndex(char: string): number;
        charToGlyph(char: string): { advanceWidth?: number };
    }
    class Font {
        constructor(options: {
            familyName: string;
            styleName: string;
            unitsPerEm: number;
            ascender: number;
            descender: number;
            createdTimestamp?: number;
            glyphs: Glyph[];
        });
        toArrayBuffer(): ArrayBuffer;
    }
    const opentype: {
        Path: typeof Path;
        Glyph: typeof Glyph;
        Font: typeof Font;
        parse(buffer: ArrayBuffer): ParsedFont;
    };
    export default opentype;
}
