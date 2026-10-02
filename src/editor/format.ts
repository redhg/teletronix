/** How wide a line can be before what's on it is spread over several. */
const WIDTH = 100;
/** How long something inside a one-line object can be, for it to stay one line however long. */
const SHORT = 40;
const INDENT = "    ";

/**
 * A program as JSON, the way people write it by hand: short objects and lists on one line
 * (`{ "type": "rule", "char": "═" }`), and a flat one too however long its text, longer ones
 * spread out, four spaces deep. The top level, and the screens and dialogs in it, are always
 * spread out, one to a line.
 */
export function formatJson(value: unknown): string {
    return `${format(value, "", 0, 0)}\n`;
}

/** `value` as JSON, starting `column` characters in, at `depth`. */
function format(value: unknown, indent: string, column: number, depth: number): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    const inline = oneLine(value);
    // (the file, and its screens and dialogs, always one to a line)
    if (depth >= 2 && (column + inline.length <= WIDTH || flat(value))) return inline;

    const inner = indent + INDENT;
    if (Array.isArray(value)) {
        if (value.length === 0) return "[]";
        const items = value.map((item) => inner + format(item, inner, inner.length, depth + 1));
        return `[\n${items.join(",\n")}\n${indent}]`;
    }
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (entries.length === 0) return "{}";
    const lines = entries.map(([key, item]) => {
        const start = `${inner}${JSON.stringify(key)}: `;
        return start + format(item, inner, start.length, depth + 1);
    });
    return `{\n${lines.join(",\n")}\n${indent}}`;
}

/** `value` on one line: `{ "a": 1 }`, `["a", "b"]`. */
function oneLine(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map(oneLine).join(", ")}]`;
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (entries.length === 0) return "{}";
    return `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${oneLine(item)}`).join(", ")} }`;
}

/**
 * Whether an object is flat: its values plain (text, numbers…), or short lists and objects,
 * e.g. `{ "type": "link", "text": "> A LONG LINK…", "action": { "screen": "home" } }`.
 */
function flat(value: object): boolean {
    if (Array.isArray(value)) return false;
    return Object.values(value).every(
        (item) => item === null || typeof item !== "object" || oneLine(item).length <= SHORT,
    );
}
