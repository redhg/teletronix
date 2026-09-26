import type { Element, ScreenSnapshot } from "../engine/index.ts";
import type { ElementView } from "./element-view.ts";
import { views } from "./views.ts";

interface Props {
    screen: ScreenSnapshot;
    /** The previous screen, erasing itself on top of the current one: shown but inert. */
    outgoing?: boolean;
}

export function ScreenView({ screen, outgoing = false }: Props) {
    const { run, states } = screen;

    return (
        <section
            className={outgoing ? "screen outgoing" : "screen"}
            aria-live={outgoing ? undefined : "polite"}
            aria-hidden={outgoing || undefined}
            inert={outgoing}
        >
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
