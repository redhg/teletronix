import type { CSSProperties } from "react";
import type { OutgoingSnapshot, ScreenSnapshot } from "../engine/index.ts";
import { ElementList } from "./ElementList.tsx";
import { classNames } from "./element-view.ts";

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
            <ElementList run={run} states={states} />
        </section>
    );
}
