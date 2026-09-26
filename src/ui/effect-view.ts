import { type ComponentType, useLayoutEffect } from "react";

export interface EffectViewProps<O> {
    options: O;
}

export type EffectView<O> = ComponentType<EffectViewProps<O>>;

/**
 * Sets CSS custom properties and a `data-<flag>` attribute on the root element while the
 * effect is mounted, for effects that restyle the page rather than draw over it.
 */
export function useRootStyle(flag: string, properties: Record<string, string>) {
    const key = JSON.stringify(properties);
    // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands in for `properties`
    useLayoutEffect(() => {
        const root = document.documentElement;
        root.dataset[flag] = "";
        for (const [name, value] of Object.entries(properties)) root.style.setProperty(name, value);
        return () => {
            delete root.dataset[flag];
            for (const name of Object.keys(properties)) root.style.removeProperty(name);
        };
    }, [flag, key]);
}
