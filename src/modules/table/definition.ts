import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import { ElementAlignSchema, ElementBaseShape } from "../../engine/schema/common.ts";

export const TableColumnSchema = z
    .strictObject({
        title: z.string().optional().meta({ description: "Its heading" }),
        align: z.enum(["left", "center", "right"]).default("left").meta({
            description: 'Where its cells sit: "left", "center" or "right" (default: "left")',
        }),
        width: z.int().min(1).optional().meta({
            description:
                "Its width in characters; longer cells are cut short (default: its widest cell)",
        }),
    })
    .meta({ description: "A column's heading and layout" });

export const TableSchema = z
    .strictObject({
        type: z.literal("table"),
        columns: z.array(TableColumnSchema).optional().meta({
            description:
                "Each column's heading and layout, left to right. With titles, the table has a header row.",
        }),
        rows: z
            .array(z.array(z.union([z.string(), z.number()])).min(1))
            .min(1)
            .meta({
                description:
                    'The rows, each a list of cells (text, which can show variables as "{name}", or numbers)',
            }),
        border: z
            .enum(["none", "box"])
            .default("none")
            .meta({
                description:
                    'How it\'s drawn: "none" (columns spaced apart, the header underlined) or ' +
                    '"box" (box-drawing lines around every cell) (default: "none")',
            }),
        gap: z.int().min(1).default(2).meta({
            description: 'Characters between columns, with "border": "none" (default: 2)',
        }),
        align: ElementAlignSchema,
        ...ElementBaseShape,
    })
    .meta({
        description:
            "Rows and columns of text, laid out in character columns: a crew manifest, a cargo " +
            "list, a sensor readout. It's kept exactly as written, never wrapped.",
    });

export type TableElement = z.output<typeof TableSchema> & ElementIdentity;

type Align = "left" | "center" | "right";

/** Text fitted to exactly `width` characters, placed by `align`. */
function fitCell(text: string, width: number, align: Align): string {
    const cut = text.length > width ? text.slice(0, width) : text;
    const room = width - cut.length;
    if (align === "right") return " ".repeat(room) + cut;
    if (align === "center") {
        const left = Math.floor(room / 2);
        return " ".repeat(left) + cut + " ".repeat(room - left);
    }
    return cut + " ".repeat(room);
}

/** The table as lines of text, with variables filled in by `format`. */
export function tableText(
    table: TableElement,
    format: (text: string) => string = (t) => t,
): string {
    const count = Math.max(table.columns?.length ?? 0, ...table.rows.map((row) => row.length));
    const column = (i: number) => table.columns?.[i];
    const header = table.columns?.some((c) => c.title !== undefined)
        ? Array.from({ length: count }, (_, i) => column(i)?.title ?? "")
        : null;
    const rows = table.rows.map((row) =>
        Array.from({ length: count }, (_, i) => format(String(row[i] ?? ""))),
    );
    const widths = Array.from(
        { length: count },
        (_, i) =>
            column(i)?.width ??
            Math.max(1, header?.[i]?.length ?? 0, ...rows.map((row) => row[i]?.length ?? 0)),
    );
    const cells = (row: string[], heading = false) =>
        row.map((cell, i) =>
            fitCell(cell, widths[i] ?? 1, heading ? "left" : (column(i)?.align ?? "left")),
        );

    if (table.border === "box") {
        const rule = (left: string, middle: string, right: string) =>
            left + widths.map((width) => "─".repeat(width + 2)).join(middle) + right;
        const line = (row: string[], heading = false) => `│ ${cells(row, heading).join(" │ ")} │`;
        return [
            rule("┌", "┬", "┐"),
            ...(header ? [line(header, true), rule("├", "┼", "┤")] : []),
            ...rows.map((row) => line(row)),
            rule("└", "┴", "┘"),
        ].join("\n");
    }

    const gap = " ".repeat(table.gap);
    const line = (row: string[], heading = false) => cells(row, heading).join(gap).trimEnd();
    return [
        ...(header ? [line(header, true), widths.map((width) => "─".repeat(width)).join(gap)] : []),
        ...rows.map((row) => line(row)),
    ].join("\n");
}

export const tableModule: ModuleDefinition<TableElement> = {
    text: (table, _memory, format) => tableText(table, format),
};
