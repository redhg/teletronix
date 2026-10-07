// Shows some characters as others (config.characters), e.g. for a font that lacks "<". Only
// what's on the page changes: the program's text, and what players type, stay as written, so
// commands and conditions still match. Every character is swapped for exactly one, so text
// keeps its shape and the layout, measured from the program's text, still fits.
//
// Text reaches the page by many routes (each element's view, the bars, dialogs), so rather
// than each of them, this watches the page: text drawn or changed is swapped as it lands.

/** A text with each mapped character swapped for its stand-in. */
export function mapText(text: string, map: ReadonlyMap<string, string>): string {
    let out = "";
    let changed = false;
    for (const char of text) {
        const to = map.get(char);
        if (to === undefined) {
            out += char;
        } else {
            out += to;
            changed = true;
        }
    }
    return changed ? out : text;
}

/** Text left as written: what screen readers read, and what players type. */
const KEEP = ".sr-only, input, textarea, script, style";

/**
 * Swaps mapped characters in the text under `root`, now and whenever it changes. Returns a
 * function that stops (text already swapped stays swapped).
 */
export function mapCharacters(
    root: Node,
    characters: Readonly<Record<string, string>>,
): () => void {
    const map = new Map(Object.entries(characters));
    if (map.size === 0) return () => {};
    // what it last wrote into each node, so its own writes aren't swapped again (with "<" as
    // "(" and "(" as "<", that would go on forever)
    const written = new WeakMap<Text, string>();

    const swap = (node: Text) => {
        if (written.get(node) === node.data) return;
        if (node.parentElement?.closest(KEEP)) return;
        const mapped = mapText(node.data, map);
        written.set(node, mapped);
        if (mapped !== node.data) node.data = mapped;
    };
    const swapUnder = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            swap(node as Text);
            return;
        }
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        for (let text = walker.nextNode(); text; text = walker.nextNode()) swap(text as Text);
    };

    swapUnder(root);
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            if (record.type === "characterData") swapUnder(record.target);
            else for (const added of record.addedNodes) swapUnder(added);
        }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
}
