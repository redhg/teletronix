/** A place in a program as written: keys and indices, e.g. ["config", "header", 0]. */
export type Path = readonly (string | number)[];

/** The value at `path`, if there is one. */
export function getIn(value: unknown, path: Path): unknown {
    let at = value;
    for (const key of path) {
        if (at === null || typeof at !== "object") return undefined;
        at = (at as Record<string | number, unknown>)[key];
    }
    return at;
}

/**
 * `value` with `path` set to `next` (or, for undefined, the key removed), leaving `value`
 * itself as it was: each version stays whole, for undo.
 */
export function setIn(value: unknown, path: Path, next: unknown): unknown {
    const [key, ...rest] = path;
    if (key === undefined) return next;
    const container =
        value !== null && typeof value === "object" ? value : typeof key === "number" ? [] : {};
    const current = (container as Record<string | number, unknown>)[key];
    const changed = setIn(current, rest, next);
    if (Array.isArray(container)) {
        const copy = [...container];
        if (changed === undefined && rest.length === 0) copy.splice(key as number, 1);
        else copy[key as number] = changed;
        return copy;
    }
    const copy: Record<string, unknown> = { ...(container as Record<string, unknown>) };
    if (changed === undefined) delete copy[key];
    else copy[key] = changed;
    return copy;
}

/** A parse error's path ("config.header[0].left") as a path. */
export function parsePath(text: string): Path {
    return [...text.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map((match) =>
        match[2] === undefined ? (match[1] as string) : Number(match[2]),
    );
}
