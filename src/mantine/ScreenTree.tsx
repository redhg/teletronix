import {
    Card,
    Code,
    Collapse,
    Group,
    NavLink,
    Stack,
    Text,
    TextInput,
    UnstyledButton,
} from "@mantine/core";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import "./tools.css";

/** A screen, for the tree: its id, and its title and parent if it has them. */
export interface TreeScreen {
    id: string;
    title?: string;
    parent?: string;
}

interface Props {
    screens: readonly TreeScreen[];
    /** The screen to mark (and open the folders of) */
    current: string | null;
    onSelect: (id: string) => void;
    /** Smaller, without a card: e.g. for a sidebar */
    compact?: boolean;
}

/**
 * Every screen, under its parent (as in a breadcrumb), with a box to find one by name. A
 * parent that isn't there, or parents in a circle, leave a screen at the top.
 */
export function ScreenTree({ screens, current, onSelect, compact = false }: Props) {
    const [filter, setFilter] = useState("");
    const byId = useMemo(() => new Map(screens.map((screen) => [screen.id, screen])), [screens]);
    // each screen's parent, if it's one the tree can put it under
    const parentOf = useMemo(() => {
        const parents = new Map<string, string | undefined>();
        for (const screen of screens) {
            let parent =
                screen.parent !== undefined && byId.has(screen.parent) ? screen.parent : undefined;
            // (not under itself, by any number of steps)
            const seen = new Set([screen.id]);
            for (let at = parent; at !== undefined; at = byId.get(at)?.parent) {
                if (seen.has(at)) {
                    parent = undefined;
                    break;
                }
                seen.add(at);
            }
            parents.set(screen.id, parent);
        }
        return parents;
    }, [screens, byId]);
    const children = useMemo(() => {
        const map = new Map<string | undefined, string[]>();
        for (const screen of screens) {
            const parent = parentOf.get(screen.id);
            map.set(parent, [...(map.get(parent) ?? []), screen.id]);
        }
        return map;
    }, [screens, parentOf]);

    // folders opened by hand, and those the current screen is in
    const [open, setOpen] = useState(new Set<string>());
    useEffect(() => {
        const path: string[] = [];
        for (let id = current ?? undefined; id !== undefined; id = parentOf.get(id)) path.push(id);
        setOpen((was) => new Set([...was, ...path]));
    }, [current, parentOf]);
    const toggle = (id: string) =>
        setOpen((was) => {
            const next = new Set(was);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const label = (id: string) => byId.get(id)?.title ?? id.toUpperCase();
    const item = (id: string) => (
        <NavLink
            component="button"
            label={label(id)}
            rightSection={compact ? undefined : <Code fz="xs">{id}</Code>}
            description={compact && byId.get(id)?.title ? id : undefined}
            active={id === current}
            aria-current={id === current ? "true" : undefined}
            onClick={() => onSelect(id)}
            py={compact ? 2 : 4}
            style={{ flex: 1, minWidth: 0, borderRadius: "var(--mantine-radius-sm)" }}
        />
    );
    const branch = (parent: string | undefined, depth: number): ReactNode =>
        (children.get(parent) ?? []).map((id) => {
            const kids = children.get(id);
            return (
                <div key={id}>
                    <Group gap={2} wrap="nowrap" pl={depth * (compact ? 12 : 18)}>
                        {kids ? (
                            <UnstyledButton
                                className="tool-toggle"
                                aria-label={`${open.has(id) ? "Hide" : "Show"} the screens under ${label(id)}`}
                                aria-expanded={open.has(id)}
                                onClick={() => toggle(id)}
                            >
                                {open.has(id) ? "▾" : "▸"}
                            </UnstyledButton>
                        ) : (
                            <span className="tool-toggle" />
                        )}
                        {item(id)}
                    </Group>
                    {kids && <Collapse expanded={open.has(id)}>{branch(id, depth + 1)}</Collapse>}
                </div>
            );
        });

    const query = filter.trim().toLowerCase();
    const found = query
        ? screens.filter(
              (screen) =>
                  screen.id.toLowerCase().includes(query) ||
                  (screen.title ?? "").toLowerCase().includes(query),
          )
        : [];
    const list = (
        <>
            {query
                ? found.map((screen) => <div key={screen.id}>{item(screen.id)}</div>)
                : branch(undefined, 0)}
            {query && found.length === 0 && (
                <Text size="sm" c="dimmed" p="xs">
                    No screen matches.
                </Text>
            )}
        </>
    );
    return (
        <Stack gap={compact ? 6 : "sm"}>
            <TextInput
                type="search"
                size={compact ? "xs" : "sm"}
                placeholder="Find a screen"
                aria-label="Find a screen"
                value={filter}
                onChange={(event) => setFilter(event.currentTarget.value)}
            />
            {compact ? (
                <nav aria-label="Screens">{list}</nav>
            ) : (
                <Card withBorder padding="xs" component="nav" aria-label="Screens">
                    {list}
                </Card>
            )}
        </Stack>
    );
}
