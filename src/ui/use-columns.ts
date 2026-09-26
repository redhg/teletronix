import { type RefObject, useLayoutEffect } from "react";

const PROBE_LENGTH = 100;

/**
 * Measures how many monospace characters fit across `ref`'s content box and reports
 * it on mount, on resize, and when web fonts finish loading.
 */
export function useColumns(
    ref: RefObject<HTMLElement | null>,
    onChange: (columns: number) => void,
) {
    useLayoutEffect(() => {
        const container = ref.current;
        if (!container) return;

        // measuring many characters averages out sub-pixel rounding
        const probe = document.createElement("span");
        probe.textContent = "0".repeat(PROBE_LENGTH);
        probe.setAttribute("aria-hidden", "true");
        Object.assign(probe.style, {
            // fixed, so the probe can't widen the page's scrollable area
            position: "fixed",
            top: "0",
            left: "0",
            visibility: "hidden",
            whiteSpace: "pre",
        });
        container.append(probe);

        const measure = () => {
            const style = getComputedStyle(container);
            const width =
                container.clientWidth -
                Number.parseFloat(style.paddingLeft) -
                Number.parseFloat(style.paddingRight);
            const charWidth = probe.getBoundingClientRect().width / PROBE_LENGTH;
            if (charWidth > 0) onChange(Math.max(1, Math.floor(width / charWidth)));
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        document.fonts.addEventListener("loadingdone", measure);

        return () => {
            observer.disconnect();
            document.fonts.removeEventListener("loadingdone", measure);
            probe.remove();
        };
    }, [ref, onChange]);
}
