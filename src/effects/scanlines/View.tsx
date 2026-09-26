import { useLayoutEffect } from "react";
import type { EffectViewProps } from "../../ui/effect-view.ts";
import { classNames } from "../../ui/element-view.ts";
import type { ScanlinesOptions } from "./definition.ts";
import "./style.css";

export function ScanlinesView({ options }: EffectViewProps<ScanlinesOptions>) {
    // on the root, so the lines also cover dialogs (which render above everything else)
    useLayoutEffect(() => {
        const root = document.documentElement;
        root.dataset.scanlines = "";
        root.style.setProperty("--scanlines-opacity", String(options.opacity));
        return () => {
            delete root.dataset.scanlines;
            root.style.removeProperty("--scanlines-opacity");
        };
    }, [options.opacity]);

    return <div className={classNames("scanlines", options.moving && "scanlines-moving")} />;
}
