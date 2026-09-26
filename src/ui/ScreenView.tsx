import type { CSSProperties } from "react";
import type { Element, OutgoingSnapshot, ScreenSnapshot } from "../engine/index.ts";
import { classNames, type ElementView } from "./element-view.ts";
import { views } from "./views.ts";

interface Props {
    screen: ScreenSnapshot;
    /**
     * For the previous screen, how it's leaving. It's shown on top of the current one,
     * inert, while it erases (glitch) or fades out (fade).
     */
    leaving?: OutgoingSnapshot["transition"];
}

export function ScreenView({ screen, leaving }: Props) {
    const outgoing = leaving !== undefined;
    const fading = leaving?.type === "fade";
    const { run, states } = screen;
    const firstPending = states.findIndex((state) => state !== "done");

    return (
        <section
            className={classNames("screen", outgoing && "outgoing", fading && "fading")}
            style={
                fading
                    ? ({ "--fade-duration": `${leaving.duration}ms` } as CSSProperties)
                    : undefined
            }
            aria-live={outgoing ? undefined : "polite"}
            aria-hidden={outgoing || undefined}
            inert={outgoing}
        >
            {run.elements.map((element, index) => {
                const state = states[index] ?? "ready";
                // elements appear when their turn comes; one still loading shows when the
                // screen is waiting on it
                const shown =
                    state === "active" ||
                    state === "done" ||
                    (state === "unloaded" && index === firstPending);
                if (!shown) return null;

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
