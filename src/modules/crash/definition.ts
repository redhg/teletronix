import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { createTimedReveal } from "../../engine/reveal/index.ts";
import { ElementBaseShape } from "../../engine/schema/common.ts";

export const DEFAULT_CRASH_MESSAGE = "FATAL EXCEPTION 0E AT 0028:C0011E36";

export const CrashSchema = z
    .strictObject({
        type: z.literal("crash"),
        message: z
            .union([z.string(), z.array(z.string()).min(1)])
            .default(DEFAULT_CRASH_MESSAGE)
            .transform((message) => (Array.isArray(message) ? message : [message]))
            .meta({
                description:
                    "A message that surfaces through the noise now and then: a line, or a list " +
                    `of lines (default: "${DEFAULT_CRASH_MESSAGE}")`,
            }),
        fragments: z
            .array(z.string().min(1))
            .optional()
            .meta({
                description:
                    "Bits of text scattered through the noise (default: the lines of the " +
                    "screen before, as if it had broken apart)",
            }),
        ...ElementBaseShape,
    })
    .meta({
        description:
            "The whole window fills with garbage that never stops changing, like a computer " +
            "that has crashed. It doesn't end: follow it with a pause (and a `next` rule) to " +
            "let the player restart.",
    });

export type CrashElement = z.output<typeof CrashSchema> & ElementIdentity;

/** Characters a crashed screen is made of: blocks, symbols, and code page 437's oddities. */
export const GARBAGE =
    "█▓▒░▀▄▌▐■□▪◘◙○●◊♦♣♠♥☺☻♪♫¶§†¤¥£¢ÇüéâäàåçêëèïîÄÅÉæÆôöòûùÿÖÜ" +
    "!#$%&*+/<=>?@\\^_|~{}[]0123456789ABCDEFXZ";

/**
 * A crashed screen as a grid of characters, `columns` by `rows`, that gets worse each time
 * it's corrupted. Kept apart from the view so it can be tested.
 */
export class CrashGrid {
    private cells: string[][];
    private readonly random: () => number;
    private readonly fragments: string[];
    private readonly message: string[];
    /** Where the message is, left alone for a while so it can be read: row → [from, to). */
    private held = new Map<number, [number, number]>();
    /** How many more corruptions leave the message alone. */
    private holding = 0;
    columns: number;
    rows: number;

    constructor(options: {
        columns: number;
        rows: number;
        /** What was on screen before, which starts the picture off. */
        start: string;
        fragments: string[];
        message: string[];
        random?: () => number;
    }) {
        this.columns = options.columns;
        this.rows = options.rows;
        this.random = options.random ?? Math.random;
        this.fragments = options.fragments;
        this.message = options.message;
        const lines = options.start.split("\n");
        this.cells = Array.from({ length: this.rows }, (_, row) =>
            Array.from({ length: this.columns }, (_, col) => lines[row]?.[col] ?? " "),
        );
    }

    /** A new size, keeping what fits. */
    resize(columns: number, rows: number): void {
        this.cells = Array.from({ length: rows }, (_, row) =>
            Array.from({ length: columns }, (_, col) => this.cells[row]?.[col] ?? " "),
        );
        this.columns = columns;
        this.rows = rows;
    }

    toString(): string {
        return this.cells.map((row) => row.join("")).join("\n");
    }

    private pick<T>(items: readonly T[]): T | undefined {
        return items[Math.floor(this.random() * items.length)];
    }

    private put(row: number, col: number, text: string, force = false): void {
        const cells = this.cells[row];
        if (!cells) return;
        const held = force ? undefined : this.held.get(row);
        for (let i = 0; i < text.length; i++) {
            const at = col + i;
            if (held && at >= held[0] && at < held[1]) continue;
            if (at >= 0 && at < this.columns) cells[at] = text.charAt(i);
        }
    }

    /**
     * One moment of corruption, `amount` (0 to 1) as bad as it gets: scattered characters,
     * and now and then a fragment, a torn line or a block.
     */
    corrupt(amount = 1): void {
        const { rows, columns } = this;
        if (this.holding > 0 && --this.holding === 0) this.held.clear();
        const cells = Math.round(rows * columns * 0.02 * amount);
        for (let i = 0; i < cells; i++) {
            const row = Math.floor(this.random() * rows);
            const col = Math.floor(this.random() * columns);
            this.put(row, col, this.random() < 0.3 ? " " : (this.pick([...GARBAGE]) ?? " "));
        }
        if (this.random() < 0.4 * amount) {
            const fragment = this.pick(this.fragments);
            if (fragment) {
                const start = Math.floor(this.random() * fragment.length);
                const piece = fragment.slice(start, start + 4 + Math.floor(this.random() * 30));
                this.put(
                    Math.floor(this.random() * rows),
                    Math.floor(this.random() * columns),
                    piece,
                );
            }
        }
        if (this.random() < 0.15 * amount) {
            // a torn line: shifted sideways
            const index = Math.floor(this.random() * rows);
            const row = this.cells[index];
            if (row && !this.held.has(index)) {
                const shift = Math.floor(this.random() * columns);
                row.push(...row.splice(0, shift));
            }
        }
        if (this.random() < 0.08 * amount) {
            const glyph = this.pick([..."█▓▒░ "]) ?? " ";
            const top = Math.floor(this.random() * rows);
            const left = Math.floor(this.random() * columns);
            const height = 1 + Math.floor(this.random() * 4);
            const width = 2 + Math.floor(this.random() * 20);
            for (let row = top; row < top + height; row++) this.put(row, left, glyph.repeat(width));
        }
    }

    /**
     * Writes the message across the middle third of the screen, centered, where the next
     * `hold` corruptions leave it alone.
     */
    showMessage(hold = 0): void {
        const top = Math.floor(this.rows / 3 + (this.random() * this.rows) / 3);
        this.held.clear();
        this.message.forEach((line, i) => {
            const left = Math.floor((this.columns - line.length) / 2);
            this.put(top + i, left, line, true);
            if (hold > 0) this.held.set(top + i, [left, left + line.length]);
        });
        this.holding = hold;
    }
}

export const crashModule: ModuleDefinition<CrashElement> = {
    text: (element) => element.message.join("\n"),
    // it's there at once, and never finishes changing
    reveal: () => createTimedReveal(0),
};
