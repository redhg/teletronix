// Big digits for a timer, drawn in block characters: each a 3×5 grid of "pixels", every
// pixel two characters wide so it comes out roughly square.

const GLYPHS: Record<string, string[]> = {
    "0": ["###", "#.#", "#.#", "#.#", "###"],
    "1": [".#.", "##.", ".#.", ".#.", "###"],
    "2": ["###", "..#", "###", "#..", "###"],
    "3": ["###", "..#", "###", "..#", "###"],
    "4": ["#.#", "#.#", "###", "..#", "..#"],
    "5": ["###", "#..", "###", "..#", "###"],
    "6": ["###", "#..", "###", "#.#", "###"],
    "7": ["###", "..#", "..#", "..#", "..#"],
    "8": ["###", "#.#", "###", "#.#", "###"],
    "9": ["###", "#.#", "###", "..#", "###"],
    ":": [".", "#", ".", "#", "."],
    "-": ["...", "...", "###", "...", "..."],
    " ": ["..", "..", "..", "..", ".."],
};

const PIXEL = "██";
const BLANK = "  ";

/** Characters the big version of `text` takes across. */
export function bigWidth(text: string): number {
    return [...text].reduce(
        (sum, character, i) =>
            sum + (GLYPHS[character]?.[0]?.length ?? 3) * 2 + (i > 0 ? BLANK.length : 0),
        0,
    );
}

/** `text` (digits, colons, dashes and spaces) as five lines of big block digits. */
export function bigDigits(text: string): string[] {
    return [0, 1, 2, 3, 4].map((row) =>
        [...text]
            .map((character) =>
                [...(GLYPHS[character]?.[row] ?? "...")]
                    .map((pixel) => (pixel === "#" ? PIXEL : BLANK))
                    .join(""),
            )
            .join(BLANK)
            .trimEnd(),
    );
}
