import type { Element, ScreenSnapshot } from "../engine/index.ts";
import type { ElementView } from "./element-view.ts";
import { views } from "./views.ts";

export function ScreenView({ screen }: { screen: ScreenSnapshot }) {
    const { run, states } = screen;

    return (
        <section className="screen" aria-live="polite">
            {run.elements.map((element, index) => {
                const state = states[index] ?? "ready";
                // elements appear when their turn comes
                if (state === "ready" || state === "unloaded") return null;

                const View = views[element.type] as ElementView<Element>;
                return (
                    <View
                        key={element.id}
                        element={element}
                        state={state}
                        run={run}
                        index={index}
                    />
                );
            })}
        </section>
    );
}
