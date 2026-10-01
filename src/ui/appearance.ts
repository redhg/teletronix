import departureMono from "../assets/fonts/departure-mono.woff2";
import astPremiumExec from "../assets/fonts/WebPlus_AST_PremiumExec.woff";
import ibmCga from "../assets/fonts/WebPlus_IBM_CGA-2y.woff";
import ibmCgaThin from "../assets/fonts/WebPlus_IBM_CGAthin-2y.woff";
import ibmEga from "../assets/fonts/WebPlus_IBM_EGA_8x14.woff";
import ibmMda from "../assets/fonts/WebPlus_IBM_MDA.woff";
import ibmVga from "../assets/fonts/WebPlus_IBM_VGA_9x16.woff";
import toshibaSatellite from "../assets/fonts/WebPlus_ToshibaSat_8x16.woff";
import {
    DEFAULT_FONT_SCALE,
    FONTS,
    type FontId,
    isSystemFont,
    type Palette,
} from "../engine/index.ts";

// Fonts from The Ultimate Oldschool PC Font Pack by VileR (https://int10h.org/oldschool-pc-fonts/,
// CC BY-SA 4.0) and Departure Mono by Helena Zhang (SIL OFL 1.1). Licenses: public/licenses/.
const FONT_FILES: Partial<Record<FontId, string>> = {
    "ast-premiumexec": astPremiumExec,
    "ibm-vga": ibmVga,
    "ibm-ega": ibmEga,
    "ibm-cga": ibmCga,
    "ibm-cga-thin": ibmCgaThin,
    "ibm-mda": ibmMda,
    "toshiba-satellite": toshibaSatellite,
    "departure-mono": departureMono,
};

const loading = new Map<FontId, Promise<void>>();

/** Loads a font once, only when a program (or the settings panel) asks for it. */
export function loadFont(font: FontId): Promise<void> {
    let promise = loading.get(font);
    const file = FONT_FILES[font];
    // an installed font has nothing to load
    if (!file) return Promise.resolve();
    if (!promise) {
        const face = new FontFace(family(font), `url(${file})`, { display: "block" });
        document.fonts.add(face);
        promise = face.load().then(() => undefined);
        loading.set(font, promise);
    }
    return promise;
}

const family = (font: FontId) => `Teletronix ${font}`;

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
    const info: { system?: string; pixelHeight: number } = FONTS[font];
    root.setProperty(
        "--font-family",
        info.system ? `${info.system}, monospace` : `"${family(font)}", ui-monospace, monospace`,
    );
    root.setProperty("--font-px", `${info.pixelHeight}px`);
    root.setProperty("--font-scale", String(fontScale));
    root.setProperty("--line-spacing", String(lineSpacing));
    // pixel fonts stay sharp without smoothing; installed (outline) fonts need it
    root.setProperty("--font-smoothing", isSystemFont(font) ? "auto" : "none");
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
