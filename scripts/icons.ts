// Renders the app icons from public/icons/icon.svg: `node scripts/icons.ts`. Run it after
// changing the SVG. Uses Playwright's Chromium (`npx playwright install chromium`).

import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const DIR = new URL("../public/icons/", import.meta.url);
/** Sizes for the web app manifest, and 180 for iOS's home screen. */
const SIZES = [180, 192, 512];

const svg = await readFile(new URL("icon.svg", DIR), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
        `<style>body { margin: 0 } svg { display: block; width: ${size}px; height: ${size}px }</style>${svg}`,
    );
    const path = new URL(`icon-${size}.png`, DIR).pathname;
    await page.screenshot({ path, omitBackground: false });
    console.log(`Wrote ${path}`);
}
await browser.close();
