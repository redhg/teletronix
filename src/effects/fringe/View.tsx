import type { EffectViewProps } from "../../ui/effect-view.ts";
import { useRootStyle } from "../../ui/effect-view.ts";
import type { FringeOptions } from "./definition.ts";

/**
 * Chromatic aberration: red and cyan ghosts either side of the text, as if the tube's
 * color guns were slightly misaligned. It restyles the text instead of drawing a layer.
 */
export function FringeView({ options }: EffectViewProps<FringeOptions>) {
    const { offset, strength } = options;
    useRootStyle("fringe", {
        "--fringe": `${-offset}px 0 rgb(255 40 80 / ${strength}), ${offset}px 0 rgb(40 200 255 / ${strength})`,
    });
    return null;
}
