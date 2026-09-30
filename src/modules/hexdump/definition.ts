import { z } from "zod";
import { type ElementIdentity, LOAD_FAILED, type ModuleDefinition } from "../../engine/module.ts";
import { seededRandom } from "../../engine/random.ts";
import { type Action, ActionSchema, ElementBaseShape } from "../../engine/schema/common.ts";
import { KeysSchema } from "../../engine/schema/next.ts";

export const DEFAULT_ROW_SPEED = 12;

export const ByteRangeSchema = z
    .strictObject({
        from: z.int().min(0).meta({ description: "The first byte, counting from 0" }),
        to: z.int().min(0).meta({ description: "The last byte" }),
    })
    .meta({ description: "A range of bytes" });

export const HighlightSchema = z
    .union([
        z.string().min(1).meta({ description: "Text: every place it appears in the bytes" }),
        ByteRangeSchema,
    ])
    .meta({ description: "Bytes to draw in the alert color: some text, or a range" });

export const HexdumpExitSchema = z
    .strictObject({
        key: KeysSchema.default(["escape"]).meta({
            description: 'The key: "any", a key name, or an array (default: "Escape")',
        }),
        action: ActionSchema.meta({ description: "What happens" }),
    })
    .meta({ description: "A key that leaves a hex dump, once it has appeared" });

export const HexdumpSchema = z
    .strictObject({
        type: z.literal("hexdump"),
        text: z
            .union([z.string(), z.array(z.string()).min(1)])
            .transform((text) => (Array.isArray(text) ? text.join("\n") : text))
            .optional()
            .meta({
                description:
                    "Text to show as bytes (a string, or a list of lines), readable in the text " +
                    'column. With "size", it\'s hidden among random bytes.',
            }),
        src: z.string().min(1).optional().meta({
            description:
                "A file to show instead, of any kind, relative to the page. The screen waits for it to load.",
        }),
        size: z.int().min(1).max(65_536).optional().meta({
            description:
                'This many random bytes, the same each time, with the "text" (if any) hidden among them',
        }),
        at: z.int().min(0).optional().meta({
            description:
                'Where the "text" goes among the random bytes, counting from 0 (default: two-thirds of the way in)',
        }),
        offset: z.int().min(0).default(0).meta({
            description: "The address shown for the first byte (default: 0)",
        }),
        perRow: z
            .union([z.literal(4), z.literal(8), z.literal(16)])
            .optional()
            .meta({ description: "Bytes per row: 4, 8 or 16 (default: as many as fit)" }),
        ascii: z.boolean().default(true).meta({
            description: "Show the bytes as text too, in a column on the right (default: true)",
        }),
        lowercase: z
            .boolean()
            .default(false)
            .meta({ description: "Lowercase hex digits (default: false)" }),
        highlight: z.array(HighlightSchema).optional().meta({
            description:
                'Bytes to draw in the alert color: some text (every place it appears), or { "from", "to" }',
        }),
        rows: z
            .union([z.int().min(1), z.literal("fill")])
            .optional()
            .meta({
                description:
                    'Show this many rows at a time, or "fill" for as many as fit the window, and ' +
                    "let the player move through the bytes with the arrow keys, Page Up/Down, " +
                    "Home and End, or by clicking (default: every row, one after another)",
            }),
        status: z
            .string()
            .optional()
            .meta({
                description:
                    'With "rows", a status line under it. {offset} is the cursor\'s address, ' +
                    "{byte} the byte there, and {size} the number of bytes.",
            }),
        exit: HexdumpExitSchema.optional().meta({
            description:
                "A key that leaves it (e.g. for a hex editor screen), once it has appeared",
        }),
        speed: z
            .number()
            .min(0)
            .default(DEFAULT_ROW_SPEED)
            .meta({
                description: `Milliseconds for each row to appear (default: ${DEFAULT_ROW_SPEED})`,
            }),
        alt: z.string().min(1).optional().meta({
            description: 'A description, for screen readers (default: "Hex dump, <size> bytes")',
        }),
        ...ElementBaseShape,
    })
    .refine(
        (dump) =>
            dump.src !== undefined
                ? dump.text === undefined && dump.size === undefined
                : dump.text !== undefined || dump.size !== undefined,
        { message: 'Give it "text", "size" (or both), or "src" on its own' },
    )
    .meta({
        description:
            "Bytes as a hex dump: an address, the bytes in hex, and the same bytes as text. From " +
            "your text, random bytes (with text hidden among them) or a file. Only for looking at.",
    });

export type HexdumpElement = z.output<typeof HexdumpSchema> & ElementIdentity;

/** Text as UTF-8 bytes. (The engine has no TextEncoder: it doesn't assume a browser.) */
export function utf8(text: string): Uint8Array {
    const bytes: number[] = [];
    for (const character of text) {
        const code = character.codePointAt(0) ?? 0;
        if (code < 0x80) bytes.push(code);
        else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
        else if (code < 0x10000) {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
        } else {
            bytes.push(
                0xf0 | (code >> 18),
                0x80 | ((code >> 12) & 63),
                0x80 | ((code >> 6) & 63),
                0x80 | (code & 63),
            );
        }
    }
    return Uint8Array.from(bytes);
}

/** A number for a string, to seed an element's random bytes so they're the same each visit. */
function hash(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
}

/** The bytes it shows: its file's (once loaded), or its text, among random bytes if it has a size. */
export function hexBytes(dump: HexdumpElement, file?: Uint8Array): Uint8Array {
    if (dump.src !== undefined) return file ?? new Uint8Array();
    const text = utf8(dump.text ?? "");
    if (dump.size === undefined) return text;
    const random = seededRandom(hash(`${dump.id}:${dump.size}`));
    const bytes = Uint8Array.from({ length: dump.size }, () => Math.floor(random() * 256));
    const at = Math.min(
        Math.max(0, dump.size - text.length),
        dump.at ?? Math.floor((dump.size - text.length) * (2 / 3)),
    );
    bytes.set(text.slice(0, dump.size - at), at);
    return bytes;
}

/** Characters a row takes, with `perRow` bytes. */
export function rowWidth(perRow: number, ascii: boolean): number {
    // "00000000  " + "HH " per byte + a gap mid-row + " |text|"
    return 10 + perRow * 3 + (perRow > 4 ? 1 : 0) + (ascii ? perRow + 2 : 0);
}

/** Bytes per row: as set, or the most that fit in `columns`. */
export function bytesPerRow(dump: HexdumpElement, columns: number): number {
    if (dump.perRow) return dump.perRow;
    return [16, 8].find((n) => rowWidth(n, dump.ascii) <= columns) ?? 4;
}

/** Which bytes are highlighted. */
export function highlighted(dump: HexdumpElement, bytes: Uint8Array): Set<number> {
    const marked = new Set<number>();
    for (const mark of dump.highlight ?? []) {
        if (typeof mark === "string") {
            const needle = utf8(mark);
            for (let i = 0; i + needle.length <= bytes.length; i++) {
                if (needle.every((byte, j) => bytes[i + j] === byte)) {
                    for (let j = 0; j < needle.length; j++) marked.add(i + j);
                }
            }
        } else {
            for (let i = mark.from; i <= Math.min(mark.to, bytes.length - 1); i++) marked.add(i);
        }
    }
    return marked;
}

export const hex = (value: number, digits: number, lowercase: boolean) => {
    const text = value.toString(16).padStart(digits, "0");
    return lowercase ? text : text.toUpperCase();
};

/** A byte as text: itself if printable, or a dot. */
export const asText = (byte: number) =>
    byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : ".";

/** A status line, with {offset}, {byte} and {size} filled in. */
export function statusLine(dump: HexdumpElement, bytes: Uint8Array, cursor: number): string {
    const byte = bytes[cursor];
    return (dump.status ?? "")
        .replaceAll("{offset}", hex(dump.offset + cursor, 8, dump.lowercase))
        .replaceAll("{byte}", byte === undefined ? "--" : hex(byte, 2, dump.lowercase))
        .replaceAll("{size}", bytes.length.toLocaleString("en-US"));
}

/** The byte a key press moves the cursor to, from `cursor`, with `page` rows showing. */
export function moveCursor(
    key: string,
    cursor: number,
    size: number,
    perRow: number,
    page: number,
): number | null {
    const moves: Record<string, number> = {
        ArrowLeft: cursor - 1,
        ArrowRight: cursor + 1,
        ArrowUp: cursor - perRow,
        ArrowDown: cursor + perRow,
        PageUp: cursor - perRow * page,
        PageDown: cursor + perRow * page,
        Home: 0,
        End: size - 1,
    };
    const next = moves[key];
    if (next === undefined) return null;
    // (up or down past the ends goes as far as it can, keeping to the column if it can)
    if (next < 0) return key === "ArrowLeft" ? 0 : cursor % perRow;
    if (next >= size) {
        if (key === "ArrowRight" || key === "End") return Math.max(0, size - 1);
        const lastRow = Math.floor((size - 1) / perRow) * perRow;
        return Math.min(size - 1, lastRow + (cursor % perRow));
    }
    return next;
}

export const hexdumpModule: ModuleDefinition<HexdumpElement> = {
    // (the view draws it; screen readers get its description)
    text: () => "",
    actions: (dump) => (dump.exit ? [dump.exit.action] : []),
    hotkeys: (dump) =>
        dump.exit ? dump.exit.key.map((key) => ({ key, action: dump.exit?.action as Action })) : [],
    reveal: (dump, _spec, context) => {
        // rows appear one after another; a file's aren't known until it has loaded, which is
        // before the reveal starts, so its length is worked out as it's needed
        const empty: readonly never[] = [];
        return {
            get duration() {
                const loaded = context.loaded?.();
                if (context.instant || loaded === LOAD_FAILED) return 0;
                const bytes = hexBytes(dump, loaded instanceof Uint8Array ? loaded : undefined);
                const rows = Math.ceil(bytes.length / bytesPerRow(dump, context.columns()));
                // (a window that fills the screen shows about a screenful)
                const limit = dump.rows === "fill" ? 24 : (dump.rows ?? rows);
                return dump.speed * Math.min(rows, limit);
            },
            frame: () => empty,
            final: () => empty,
        };
    },
};
