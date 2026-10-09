import { type ComponentType, useLayoutEffect } from "react";

export interface EffectViewProps<O> {
    options: O;
}

export type EffectView<O> = ComponentType<EffectViewProps<O>>;

/**
 * Who has each root style, newest last: the same effect can be mounted twice at once (the
 * screen's, and the full-window viewer's over it), and one going mustn't take the other's.
 */
const owners = new Map<string, { properties: Record<string, string> }[]>();

/** Puts the root back as a flag's newest owner has it, or clears it once it has none. */
function applyRootStyle(flag: string, previous: Record<string, string>) {
    const root = document.documentElement;
    const newest = owners.get(flag)?.at(-1);
    for (const name of Object.keys(previous)) root.style.removeProperty(name);
    if (!newest) {
        delete root.dataset[flag];
        return;
    }
    root.dataset[flag] = "";
    for (const [name, value] of Object.entries(newest.properties)) {
        root.style.setProperty(name, value);
    }
}

/**
 * Sets CSS custom properties and a `data-<flag>` attribute on the root element while the
 * effect is mounted, for effects that restyle the page rather than draw over it.
 */
export function useRootStyle(flag: string, properties: Record<string, string>) {
    const key = JSON.stringify(properties);
    // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands in for `properties`
    useLayoutEffect(() => {
        const owner = { properties };
        const list = owners.get(flag) ?? [];
        owners.set(flag, [...list, owner]);
        applyRootStyle(flag, {});
        return () => {
            const rest = (owners.get(flag) ?? []).filter((other) => other !== owner);
            if (rest.length) owners.set(flag, rest);
            else owners.delete(flag);
            applyRootStyle(flag, properties);
        };
    }, [flag, key]);
}
