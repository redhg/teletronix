import { useLayoutEffect, useState } from "react";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { RevealText } from "../../ui/RevealText.tsx";
import type { SpinnerElement } from "./definition.ts";

/** A spinner's line. Once it has finished with nothing to show (no done text), it goes. */
export function SpinnerView({ element, state, run, index }: ElementViewProps<SpinnerElement>) {
    const [empty, setEmpty] = useState(false);
    useLayoutEffect(
        () => run.subscribeFrame(index, (_frame, text) => setEmpty(text === "")),
        [run, index],
    );
    if (state === "done" && empty) return null;
    // screen readers get the label, not every turn of the spinner
    const label = element.label.trim() || "Working";
    return (
        <div className={classNames("spinner", element.className)} role="status">
            <RevealText run={run} index={index} label={state === "done" ? undefined : label} />
        </div>
    );
}
