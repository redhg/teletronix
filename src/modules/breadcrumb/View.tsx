import { Fragment, useMemo } from "react";
import { breadcrumb } from "../../engine/index.ts";
import { classNames, type ElementViewProps } from "../../ui/element-view.ts";
import { useSound } from "../../ui/sound/context.ts";
import { useTerminal } from "../../ui/terminal-context.ts";
import type { BreadcrumbElement } from "./definition.ts";
import "./style.css";

/** The screens above this one, each a link, then this one's name. */
export function BreadcrumbView({ element, interactive, run }: ElementViewProps<BreadcrumbElement>) {
    const terminal = useTerminal();
    const sound = useSound();
    const trail = useMemo(
        () => breadcrumb(terminal.program, run.screen.id),
        [terminal, run.screen.id],
    );

    return (
        <nav
            className={classNames("breadcrumb", element.className)}
            style={element.align ? { textAlign: element.align } : undefined}
            aria-label="Breadcrumb"
        >
            {trail.map((crumb, index) => {
                const { action } = crumb;
                return (
                    <Fragment key={crumb.text + String(index)}>
                        {index > 0 && <span aria-hidden="true">{element.separator}</span>}
                        {action ? (
                            <button
                                type="button"
                                className={classNames("control breadcrumb-step", element.className)}
                                disabled={!interactive}
                                onClick={() => {
                                    sound({ type: "select" });
                                    terminal.dispatch(action);
                                }}
                            >
                                {crumb.text}
                            </button>
                        ) : (
                            <span aria-current="page">{crumb.text}</span>
                        )}
                    </Fragment>
                );
            })}
        </nav>
    );
}
