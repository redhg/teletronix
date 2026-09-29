import type { Element, ElementState, ScreenRun } from "../engine/index.ts";
import type { ElementView } from "./element-view.ts";
import { views } from "./views.ts";

/** A run's elements, each once its turn comes: a screen's, or an open section's. */
export function ElementList({ run, states }: { run: ScreenRun; states: readonly ElementState[] }) {
    const firstPending = states.findIndex((state) => state !== "done");
    return run.elements.map((element, index) => {
        const state = states[index] ?? "ready";
        // elements appear when their turn comes; one still loading shows when the run is
        // waiting on it
        const shown =
            state === "active" ||
            state === "done" ||
            (state === "unloaded" && index === firstPending);
        if (!shown) return null;

        const View = views[element.type] as ElementView<Element>;
        return <View key={element.id} element={element} state={state} run={run} index={index} />;
    });
}
