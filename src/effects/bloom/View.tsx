import type { CSSProperties } from "react";
import type { EffectViewProps } from "../../ui/effect-view.ts";
import type { BloomOptions } from "./definition.ts";
import "./style.css";

/** A blurred, brightened copy of everything beneath, added on top: bright things glow. */
export function BloomView({ options }: EffectViewProps<BloomOptions>) {
    const style = {
        "--bloom-strength": options.strength,
        "--bloom-radius": `${options.radius}px`,
    } as CSSProperties;
    return <div className="bloom" style={style} />;
}
