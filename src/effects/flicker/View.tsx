import type { CSSProperties } from "react";
import type { EffectViewProps } from "../../ui/effect-view.ts";
import type { FlickerOptions } from "./definition.ts";
import "./style.css";

/** An unsteady picture: the screen dims by small, irregular amounts. */
export function FlickerView({ options }: EffectViewProps<FlickerOptions>) {
    const style = { "--flicker-strength": options.strength } as CSSProperties;
    return <div className="flicker" style={style} />;
}
