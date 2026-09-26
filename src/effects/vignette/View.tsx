import type { CSSProperties } from "react";
import type { EffectViewProps } from "../../ui/effect-view.ts";
import type { VignetteOptions } from "./definition.ts";
import "./style.css";

/** Darkened corners, like the edges of a curved tube. */
export function VignetteView({ options }: EffectViewProps<VignetteOptions>) {
    const style = { "--vignette-strength": options.strength } as CSSProperties;
    return <div className="vignette" style={style} />;
}
