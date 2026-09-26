import type { Element } from "../engine/index.ts";
import { loadImage } from "./load-image.ts";

/** Starts loading whatever an element needs before it can be revealed (see TerminalOptions.load). */
export function loadElement(element: Element): Promise<unknown> | undefined {
    switch (element.type) {
        case "bitmap":
            return loadImage(element.src);
        default:
            return undefined;
    }
}
