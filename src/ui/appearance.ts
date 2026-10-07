import departureMono from "../assets/fonts/departure-mono.woff2";
import digitTech from "../assets/fonts/digit-tech-16.woff2";
import homeVideo from "../assets/fonts/home-video.woff2";
import matrixtype from "../assets/fonts/matrixtype.woff2";
import symbolsDigitTech from "../assets/fonts/symbols-digit-tech.otf";
import symbolsHomeVideo from "../assets/fonts/symbols-home-video.otf";
import symbolsMatrixtype from "../assets/fonts/symbols-matrixtype.otf";
import symbolsXTypewriter from "../assets/fonts/symbols-x-typewriter.otf";
import astPremiumExec from "../assets/fonts/WebPlus_AST_PremiumExec.woff";
import ibmCga from "../assets/fonts/WebPlus_IBM_CGA-2y.woff";
import ibmCgaThin from "../assets/fonts/WebPlus_IBM_CGAthin-2y.woff";
import ibmEga from "../assets/fonts/WebPlus_IBM_EGA_8x14.woff";
import ibmMda from "../assets/fonts/WebPlus_IBM_MDA.woff";
import ibmVga from "../assets/fonts/WebPlus_IBM_VGA_9x16.woff";
import toshibaSatellite from "../assets/fonts/WebPlus_ToshibaSat_8x16.woff";
import xTypewriter from "../assets/fonts/x-typewriter.woff2";
import {
    DEFAULT_FONT_SCALE,
    FONTS,
    type FontId,
    isSmoothFont,
    type Palette,
    type TextShadow,
} from "../engine/index.ts";

// Fonts from The Ultimate Oldschool PC Font Pack by VileR (https://int10h.org/oldschool-pc-fonts/,
// CC BY-SA 4.0), Departure Mono by Helena Zhang (SIL OFL 1.1), and Home Video, Digit Tech,
// MatrixType (CC0) and X Typewriter (SIL OFL 1.1) by GGBotNet. Licenses: public/licenses/.
const FONT_FILES: Partial<Record<FontId, string>> = {
    "ast-premiumexec": astPremiumExec,
    "ibm-vga": ibmVga,
    "ibm-ega": ibmEga,
    "ibm-cga": ibmCga,
    "ibm-cga-thin": ibmCgaThin,
    "ibm-mda": ibmMda,
    "toshiba-satellite": toshibaSatellite,
    "departure-mono": departureMono,
    "home-video": homeVideo,
    "digit-tech": digitTech,
    matrixtype,
    "x-typewriter": xTypewriter,
};

/** Symbol fonts, made for the fonts that lack box lines and blocks (scripts/symbols-font.ts). */
const SYMBOL_FILES: Record<string, string> = {
    "home-video": symbolsHomeVideo,
    "digit-tech": symbolsDigitTech,
    matrixtype: symbolsMatrixtype,
    "x-typewriter": symbolsXTypewriter,
};

const loading = new Map<FontId, Promise<void>>();

/** Loads a font once, only when a program (or the settings panel) asks for it. */
export function loadFont(font: FontId): Promise<void> {
    let promise = loading.get(font);
    const file = FONT_FILES[font];
    // an installed font has nothing to load
    if (!file) return Promise.resolve();
    if (!promise) {
        const faces = [new FontFace(family(font), `url(${file})`, { display: "block" })];
        const symbols = symbolsOf(font);
        if (symbols) {
            faces.push(
                new FontFace(symbolsFamily(symbols), `url(${SYMBOL_FILES[symbols]})`, {
                    display: "block",
                }),
            );
        }
        for (const face of faces) document.fonts.add(face);
        promise = Promise.all(faces.map((face) => face.load())).then(() => undefined);
        loading.set(font, promise);
    }
    return promise;
}

const family = (font: FontId) => `Teletronix ${font}`;
const symbolsFamily = (symbols: string) => `Teletronix symbols ${symbols}`;
const symbolsOf = (font: FontId): string | undefined =>
    (FONTS[font] as { symbols?: string }).symbols;

/** No shadow (written so it can go in a list of shadows, where "none" can't). */
const NO_SHADOW = "0 0 transparent";

/** The shadows for each kind of text: the color's own, an alert's, and inverted text's. */
const SHADOWS: Record<
    TextShadow,
    Record<"--glow" | "--alert-glow" | "--inverse-glow", string | null>
> = {
    glow: { "--glow": null, "--alert-glow": null, "--inverse-glow": null },
    drop: {
        "--glow": "0.07em 0.07em 0 rgb(0 0 0 / 0.55)",
        "--alert-glow": "0.07em 0.07em 0 rgb(0 0 0 / 0.55)",
        "--inverse-glow": NO_SHADOW,
    },
    lcd: {
        "--glow": "0.06em 0.08em 0 rgb(from var(--fg) r g b / 0.16)",
        "--alert-glow": "0.06em 0.08em 0 rgb(from var(--alert) r g b / 0.16)",
        "--inverse-glow": NO_SHADOW,
    },
    ink: {
        "--glow": "0 0 0.03em rgb(from var(--fg) r g b / 0.45)",
        "--alert-glow": "0 0 0.03em rgb(from var(--alert) r g b / 0.45)",
        "--inverse-glow": NO_SHADOW,
    },
    none: { "--glow": NO_SHADOW, "--alert-glow": NO_SHADOW, "--inverse-glow": NO_SHADOW },
};

/** Applies colors and a font to the page. */
export function applyAppearance(
    palette: Palette,
    font: FontId,
    fontScale = DEFAULT_FONT_SCALE,
    lineSpacing = 1.25,
): void {
    const root = document.documentElement.style;
    root.setProperty("--fg", palette.fg);
    root.setProperty("--bg", palette.bg);
    root.setProperty("--alert", palette.alert);
    // the shadow text casts (the CRT's glow is the stylesheet's own), and whether the screen
    // glows behind it (a CRT's does; an LCD, or paper, doesn't)
    for (const [name, value] of Object.entries(SHADOWS[palette.shadow])) {
        if (value === null) root.removeProperty(name);
        else root.setProperty(name, value);
    }
    if (palette.shadow === "glow" || palette.shadow === "drop") {
        root.removeProperty("--screen-glow");
    } else {
        root.setProperty("--screen-glow", "none");
    }
    // bands behind every other three lines, on the lines (the terminal's padding is whole lines)
    if (palette.stripes) {
        root.setProperty(
            "--stripes",
            `repeating-linear-gradient(to bottom, transparent 0 3lh, ${palette.stripes} 3lh 6lh)`,
        );
    } else {
        root.removeProperty("--stripes");
    }
    if (palette.capitals) root.setProperty("--text-transform", "uppercase");
    else root.removeProperty("--text-transform");
    const info: { system?: string; pixelHeight: number } = FONTS[font];
    const symbols = symbolsOf(font);
    root.setProperty(
        "--font-family",
        info.system
            ? `${info.system}, monospace`
            : // (the symbol font fills in only what the font lacks)
              `"${family(font)}", ${symbols ? `"${symbolsFamily(symbols)}", ` : ""}ui-monospace, monospace`,
    );
    root.setProperty("--font-px", `${info.pixelHeight}px`);
    root.setProperty("--font-scale", String(fontScale));
    root.setProperty("--line-spacing", String(lineSpacing));
    // pixel fonts stay sharp without smoothing; outline fonts need it
    root.setProperty("--font-smoothing", isSmoothFont(font) ? "auto" : "none");
}

/**
 * Keeps --pixel-ratio up to date (it changes with zoom, and moving to another screen), so
 * small text can snap to the screen's own pixels. Returns a function that stops.
 */
export function followPixelRatio(): () => void {
    let query: MediaQueryList | null = null;
    const update = () => {
        query?.removeEventListener("change", update);
        const ratio = window.devicePixelRatio || 1;
        document.documentElement.style.setProperty("--pixel-ratio", String(ratio));
        query = matchMedia(`(resolution: ${ratio}dppx)`);
        query.addEventListener("change", update);
    };
    update();
    return () => query?.removeEventListener("change", update);
}
