import { type EffectViewProps, useRootStyle } from "../../ui/effect-view.ts";
import type { BloomOptions } from "./definition.ts";
import "./style.css";

export const BLOOM_FILTER_ID = "teletronix-bloom";

/**
 * Bright things glow: an SVG filter on the terminal blurs its content, strengthens the
 * blur, and puts it back behind the sharp original. SVG filters on HTML work in
 * every engine, unlike the backdrop-filter-and-blend-mode approach this replaced.
 */
export function BloomView({ options }: EffectViewProps<BloomOptions>) {
    useRootStyle("bloom", {});
    const { radius, strength } = options;
    // the blur spreads alpha thin, so boost it back up in proportion to the strength
    const boost = strength * 2;

    return (
        <svg className="bloom-filter" aria-hidden="true" focusable="false">
            <filter
                id={BLOOM_FILTER_ID}
                x="-10%"
                y="-10%"
                width="120%"
                height="120%"
                colorInterpolationFilters="sRGB"
            >
                <feGaussianBlur in="SourceGraphic" stdDeviation={radius / 2} result="blur" />
                <feComponentTransfer in="blur" result="glow">
                    <feFuncA type="linear" slope={boost} />
                </feComponentTransfer>
                <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        </svg>
    );
}
