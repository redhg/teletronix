// The "theme" pointer: a pixel-art arrow (and a hand, over things to click), drawn in the
// theme's colors when the theme is applied, so every theme (a program's own too) has one.

/** "#": the outline (the background's color), "o": the fill (the text's), ".": clear. */
const ARROW = [
    "#...........",
    "##..........",
    "#o#.........",
    "#oo#........",
    "#ooo#.......",
    "#oooo#......",
    "#ooooo#.....",
    "#oooooo#....",
    "#ooooooo#...",
    "#oooooooo#..",
    "#ooooo#####.",
    "#oo#oo#.....",
    "#o#.#oo#....",
    "##..#oo#....",
    "#....#oo#...",
    ".....#oo#...",
    "......##....",
];

const HAND = [
    "....##.......",
    "...#oo#......",
    "...#oo#......",
    "...#oo#......",
    "...#oo###....",
    "...#oo#oo##..",
    ".###oo#oo#o##",
    "#oo#oooooo#o#",
    "#ooooooooooo#",
    ".#oooooooooo#",
    "..#ooooooooo#",
    "..#oooooooo#.",
    "...#ooooooo#.",
    "...#oooooo#..",
    "....#oooooo#.",
    "....########.",
];

/** How many screen pixels each of the art's pixels takes. */
const SCALE = 2;

/** Pixel art as a PNG, in these colors; null where there's no canvas (e.g. tests). */
function draw(art: string[], fill: string, outline: string): string | null {
    const width = Math.max(...art.map((row) => row.length));
    const canvas = document.createElement("canvas");
    canvas.width = width * SCALE;
    canvas.height = art.length * SCALE;
    const context = canvas.getContext("2d");
    if (!context) return null;
    art.forEach((row, y) => {
        [...row].forEach((pixel, x) => {
            if (pixel === ".") return;
            context.fillStyle = pixel === "o" ? fill : outline;
            context.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        });
    });
    return canvas.toDataURL("image/png");
}

/** The CSS cursors for the theme's pointer: the arrow, and the hand, with where each points. */
export function themePointers(fg: string, bg: string): { arrow: string; hand: string } | null {
    const arrow = draw(ARROW, fg, bg);
    const hand = draw(HAND, fg, bg);
    if (!arrow || !hand) return null;
    return {
        arrow: `url(${arrow}) 0 0, default`,
        hand: `url(${hand}) ${4 * SCALE + 1} 0, pointer`,
    };
}
