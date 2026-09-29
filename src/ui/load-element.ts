import type { Element } from "../engine/index.ts";
import { imageToAscii } from "../modules/ascii/convert.ts";
import { cleanText } from "../modules/text/definition.ts";
import { loadImage } from "./load-image.ts";

/** Starts loading whatever an element needs before it can be revealed (see TerminalOptions.load). */
export function loadElement(element: Element): Promise<unknown> | undefined {
    switch (element.type) {
        case "bitmap":
            return loadImage(element.src);
        case "ascii":
            return loadImage(element.src).then((image) => imageToAscii(image, element));
        case "text":
            return element.src === undefined ? undefined : loadText(element.src);
        default:
            return undefined;
    }
}

/** A text file's contents (e.g. ASCII art). */
async function loadText(src: string): Promise<string> {
    const response = await fetch(src);
    // dev servers and static hosts often answer missing files with an HTML page
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || type.includes("html")) throw new Error(`Can't load ${src}`);
    return cleanText(await response.text());
}
