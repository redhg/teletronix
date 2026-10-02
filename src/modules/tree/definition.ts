import { z } from "zod";
import type { ElementIdentity, ModuleDefinition } from "../../engine/module.ts";
import {
    type Action,
    ActionSchema,
    ElementBaseShape,
    IdSchema,
} from "../../engine/schema/common.ts";

/** An item in a tree: a folder of more items, or something to open. */
export interface TreeItem {
    text: string;
    screen?: string;
    action?: Action;
    open: boolean;
    items?: TreeItem[];
    className?: string;
}

/** An item as written. */
interface TreeItemInput {
    text: string;
    screen?: string;
    action?: z.input<typeof ActionSchema>;
    open?: boolean;
    items?: TreeItemInput[];
    className?: string;
}

export const TreeItemSchema: z.ZodType<TreeItem, TreeItemInput> = z
    .lazy(() =>
        z
            .strictObject({
                text: z.string().min(1).meta({ description: "The item's text" }),
                screen: IdSchema.optional().meta({
                    description: "A screen it opens: in the tree's frame, if it has one",
                }),
                action: ActionSchema.optional().meta({
                    description: "What happens when it's opened, in place of a screen",
                }),
                open: z.boolean().default(false).meta({
                    description: "For a folder: start open (default: false)",
                }),
                items: z.array(TreeItemSchema).min(1).optional().meta({
                    description: "Items inside it, which make it a folder",
                }),
                className: z
                    .string()
                    .optional()
                    .meta({ description: 'Space-separated CSS classes, e.g. "alert"' }),
            })
            .refine((item) => !(item.screen && item.action), {
                message: 'Give an item a "screen" or an "action", not both',
            })
            .refine((item) => item.items || item.screen || item.action, {
                message: 'An item needs "items" (a folder), a "screen" or an "action"',
            }),
    )
    .meta({ id: "TreeItem", description: "An item in a tree: a folder of items, or one to open" });

export const TreeMarkersSchema = z
    .strictObject({
        closed: z.string().default("[+]").meta({
            description: 'Before a closed folder (default: "[+]")',
        }),
        open: z.string().default("[-]").meta({
            description: 'Before an open folder (default: "[-]")',
        }),
    })
    .meta({ description: "What a tree's folders show before their text" });

export const TreeSchema = z
    .strictObject({
        type: z.literal("tree"),
        items: z.array(TreeItemSchema).min(1).meta({ description: "The items, top to bottom" }),
        frame: IdSchema.optional().meta({
            description:
                "A frame on the screen to open items' screens in, by its name: the tree " +
                "marks the item showing there. Without it, items go to their screens.",
        }),
        markers: TreeMarkersSchema.default({ closed: "[+]", open: "[-]" }).meta({
            description: "What folders show before their text, e.g. ▶ and ▼",
        }),
        current: z.string().default(" ◄").meta({
            description: 'After the item showing in the frame (default: " ◄")',
        }),
        ...ElementBaseShape,
    })
    .meta({
        description:
            "A tree of items, like a file browser: folders open and close, and items open " +
            "their screen, in a frame beside it if it has one. <up> and <down> move, <right> " +
            "and <left> open and close folders, and <enter> (or a click) opens an item. It " +
            "remembers which folders are open.",
    });

export type TreeElement = z.output<typeof TreeSchema> & ElementIdentity;

/** A tree's memory: the paths of its open folders (e.g. "0.1": the first item's second). */
export interface TreeMemory {
    open: string[];
}

/** A visible line of a tree. */
export interface TreeRow {
    /** Where it is: its index at each level, e.g. "0.1" */
    path: string;
    item: TreeItem;
    depth: number;
    /** The lines and spaces before it */
    prefix: string;
    folder: boolean;
    isOpen: boolean;
}

/** Which folders are open: as remembered, or as written. */
export function openFolders(tree: TreeElement, memory: TreeMemory | undefined): Set<string> {
    if (memory) return new Set(memory.open);
    const open = new Set<string>();
    const visit = (items: readonly TreeItem[], parent: string) =>
        items.forEach((item, index) => {
            const path = parent ? `${parent}.${index}` : String(index);
            if (item.items && item.open) open.add(path);
            if (item.items) visit(item.items, path);
        });
    visit(tree.items, "");
    return open;
}

/** The tree's visible lines, top to bottom: the items of open folders, drawn as a tree. */
export function treeRows(tree: TreeElement, open: ReadonlySet<string>): TreeRow[] {
    const rows: TreeRow[] = [];
    const leaf = " ".repeat(Math.max(tree.markers.open.length, tree.markers.closed.length) + 1);
    const visit = (items: readonly TreeItem[], parent: string, depth: number, guides: string) =>
        items.forEach((item, index) => {
            const path = parent ? `${parent}.${index}` : String(index);
            const last = index === items.length - 1;
            const folder = item.items !== undefined;
            const isOpen = folder && open.has(path);
            const prefix = depth === 0 ? "" : ` ${guides}${last ? "└─ " : "├─ "}`;
            rows.push({ path, item, depth, prefix, folder, isOpen });
            if (isOpen && item.items) {
                const next = depth === 0 ? "" : `${guides}${last ? "    " : "│   "}`;
                visit(item.items, path, depth + 1, next);
            }
        });
    visit(tree.items, "", 0, "");
    // top-level items that aren't folders line up with folders' text
    for (const row of rows) if (row.depth === 0 && !row.folder) row.prefix = leaf;
    return rows;
}

/** A line's text: its lines, a folder's marker, and the item's text. */
export function rowText(tree: TreeElement, row: TreeRow): string {
    const marker = row.folder ? `${row.isOpen ? tree.markers.open : tree.markers.closed} ` : "";
    return `${row.prefix}${marker}${row.item.text}`;
}

/** What opening an item does: its action, or showing its screen (in the frame, if any). */
export function itemAction(tree: TreeElement, item: TreeItem): Action | undefined {
    if (item.action) return item.action;
    if (item.screen === undefined) return undefined;
    return ActionSchema.parse(
        tree.frame === undefined
            ? { screen: item.screen }
            : { frame: tree.frame, screen: item.screen },
    );
}

/** The paths of the folders an item is in, outermost first: "0.1.2" is in "0" and "0.1". */
export function ancestors(path: string): string[] {
    const parts = path.split(".");
    return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("."));
}

/** Every item, with its path. */
export function allItems(tree: TreeElement): { path: string; item: TreeItem }[] {
    const found: { path: string; item: TreeItem }[] = [];
    const visit = (items: readonly TreeItem[], parent: string) =>
        items.forEach((item, index) => {
            const path = parent ? `${parent}.${index}` : String(index);
            found.push({ path, item });
            if (item.items) visit(item.items, path);
        });
    visit(tree.items, "");
    return found;
}

export const treeModule: ModuleDefinition<TreeElement, TreeMemory> = {
    text: (tree, memory) =>
        treeRows(tree, openFolders(tree, memory))
            .map((row) => rowText(tree, row))
            .join("\n"),
    actions: (tree) =>
        allItems(tree).flatMap(({ item }) => {
            const action = itemAction(tree, item);
            return action ? [action] : [];
        }),
};
