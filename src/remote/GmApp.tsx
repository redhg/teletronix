import {
    Alert,
    Badge,
    Box,
    Button,
    Card,
    Checkbox,
    Code,
    Collapse,
    Group,
    NavLink,
    NumberInput,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Switch,
    Table,
    Tabs,
    Text,
    Textarea,
    TextInput,
    Title,
    UnstyledButton,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import {
    type FormEvent,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { EFFECTS, type EffectName, type Program, type VariableValue } from "../engine/index.ts";
import { ColorScheme } from "../mantine/ColorScheme.tsx";
import { Panel } from "../mantine/Panel.tsx";
import { AddDevice } from "./AddDevice.tsx";
import { GONE_MS, HEARTBEAT_MS } from "./follow.ts";
import {
    CODE_LENGTH,
    channelLink,
    cleanCode,
    type Link,
    type LinkStatus,
    randomId,
    relayLink,
} from "./link.ts";
import type { GmEnvelope, GmMessage, PlayerMessage, PlayerState } from "./protocol.ts";
import { useWaitingUpdate } from "./update.ts";

/** How long a burst of static lasts. */
const BURST_MS = 1500;

type Override = "program" | "on" | "off";

interface Props {
    /** The program's name in the address */
    name: string;
    program: Program;
}

/**
 * A GM's control panel: what the players' terminal (in another window) is showing, and
 * controls to change it: go to screens, open dialogs, set variables, run timers, turn
 * effects on and off, and send messages.
 */
export function GmApp({ name, program }: Props) {
    // the links are made and closed by the same effects (React may run them more than once)
    const links = useRef(new Map<string, Link>());
    const send = useCallback((message: GmMessage) => {
        const envelope: GmEnvelope = { ...message, id: randomId() };
        for (const link of links.current.values()) link.send(envelope);
    }, []);

    // the players' windows, by id, with when each last reported in
    const [players, setPlayers] = useState(new Map<string, { state: PlayerState; at: number }>());
    const [now, setNow] = useState(() => Date.now());
    const [effects, setEffects] = useState<Partial<Record<EffectName, Override>>>({});
    const effectsRef = useRef(effects);
    effectsRef.current = effects;

    const sendEffects = useCallback(
        (overrides: Partial<Record<EffectName, Override>>) => {
            const setting = Object.fromEntries(
                Object.entries(overrides)
                    .filter(([, value]) => value !== "program")
                    .map(([effect, value]) => [effect, value === "on"]),
            );
            send({ type: "effects", effects: Object.keys(setting).length > 0 ? setting : null });
        },
        [send],
    );

    const known = useRef(new Set<string>());
    const receive = useCallback(
        (message: { type: string }) => {
            if (message.type !== "state") return;
            const { player, state } = message as PlayerMessage;
            // a new window gets the effects the panel has on
            if (!known.current.has(player)) {
                known.current.add(player);
                sendEffects(effectsRef.current);
            }
            setPlayers((was) => new Map(was).set(player, { state, at: Date.now() }));
        },
        [sendEffects],
    );

    // players' windows in this browser
    useEffect(() => {
        const link = channelLink(name, receive);
        links.current.set("channel", link);
        link.send({ type: "hello", id: randomId() } satisfies GmEnvelope);
        return () => {
            link.close();
            if (links.current.get("channel") === link) links.current.delete("channel");
        };
    }, [name, receive]);

    // and on other devices, by their pairing code
    const [code, setCode] = useState(() => savedCode(name));
    const [network, setNetwork] = useState<LinkStatus | null>(null);
    useEffect(() => {
        rememberCode(name, code);
        if (!code) {
            setNetwork(null);
            return;
        }
        const link = relayLink(code, "gm", receive, (status) => {
            setNetwork(status);
            if (status === "connected") {
                link.send({ type: "hello", id: randomId() } satisfies GmEnvelope);
            }
        });
        links.current.set("relay", link);
        return () => {
            link.close();
            if (links.current.get("relay") === link) links.current.delete("relay");
        };
    }, [name, code, receive]);

    // the players know the panel's there; it knows when they've gone
    useEffect(() => {
        const timer = setInterval(() => {
            send({ type: "ping" });
            setNow(Date.now());
        }, HEARTBEAT_MS);
        return () => clearInterval(timer);
    }, [send]);

    const live = [...players.values()].filter((player) => now - player.at < GONE_MS);
    const latest = live.sort((a, b) => b.at - a.at)[0]?.state ?? null;
    const action = (action: object) => send({ type: "action", action });

    const update = useWaitingUpdate();
    const [tab, setTab] = useLocalStorage({ key: "teletronix:gm-tab", defaultValue: "screens" });
    // (the tabs stick just under the header, however tall it wraps)
    const header = useRef<HTMLElement>(null);
    const [headerHeight, setHeaderHeight] = useState(0);
    useLayoutEffect(() => {
        const element = header.current;
        if (!element) return;
        const measure = () => setHeaderHeight(element.offsetHeight);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    return (
        <Box
            className="gm"
            style={{ "--gm-header-height": `${headerHeight}px` } as React.CSSProperties}
        >
            <Box ref={header} component="header" className="gm-header" px="lg" py="sm">
                <Group justify="space-between" gap="sm">
                    <Group gap="md">
                        <Title order={3}>{program.config.name}</Title>
                        <Status count={live.length} state={latest} program={program} name={name} />
                    </Group>
                    <Group gap="sm">
                        <Button.Group>
                            <Button
                                variant="default"
                                size="xs"
                                onClick={() => action({ back: true })}
                            >
                                ← Back
                            </Button>
                            <Button
                                variant="default"
                                size="xs"
                                onClick={() => {
                                    if (confirm("Restart the program from the start screen?")) {
                                        action({ restart: true });
                                    }
                                }}
                            >
                                Restart
                            </Button>
                        </Button.Group>
                        <Pairing code={code} network={network} pair={setCode} />
                        <ColorScheme />
                    </Group>
                </Group>
            </Box>
            {update && (
                <Alert
                    variant="light"
                    radius={0}
                    title="A new version of Teletronix is ready."
                    role="status"
                >
                    <Group gap="sm">
                        <Button size="xs" onClick={update}>
                            Reload
                        </Button>
                        <Text size="sm" c="dimmed">
                            Players' windows get it the next time they're opened or reloaded.
                        </Text>
                    </Group>
                </Alert>
            )}
            <Tabs value={tab} onChange={(value) => value && setTab(value)} keepMounted>
                <Tabs.List className="gm-tabs" px="lg">
                    <Tabs.Tab value="screens">Screens</Tabs.Tab>
                    <Tabs.Tab value="messages">Messages</Tabs.Tab>
                    <Tabs.Tab value="variables">Variables</Tabs.Tab>
                    <Tabs.Tab value="effects">Effects</Tabs.Tab>
                    <Tabs.Tab value="devices">Devices</Tabs.Tab>
                </Tabs.List>
                <Box p="lg">
                    <Tabs.Panel value="screens">
                        <ScreenTree
                            program={program}
                            current={latest?.screen ?? null}
                            go={(screen) => action({ screen })}
                        />
                    </Tabs.Panel>
                    <Tabs.Panel value="messages">
                        <SimpleGrid cols={{ base: 1, md: 2 }}>
                            <Transmit send={send} />
                            <Dialogs
                                program={program}
                                open={latest?.dialog ?? null}
                                go={(dialog) => action({ dialog })}
                                close={() => send({ type: "close-dialog" })}
                            />
                        </SimpleGrid>
                    </Tabs.Panel>
                    <Tabs.Panel value="variables">
                        <SimpleGrid cols={{ base: 1, md: 2 }}>
                            <Variables
                                program={program}
                                state={latest}
                                set={(set) => action({ set })}
                            />
                            <Timers program={program} state={latest} action={action} />
                        </SimpleGrid>
                    </Tabs.Panel>
                    <Tabs.Panel value="effects">
                        <Effects
                            effects={effects}
                            change={(next) => {
                                setEffects(next);
                                sendEffects(next);
                            }}
                            burst={() => send({ type: "burst", ms: BURST_MS })}
                        />
                    </Tabs.Panel>
                    <Tabs.Panel value="devices">
                        <SimpleGrid cols={{ base: 1, md: 2 }}>
                            <AddDevice program={name} code={code} pair={setCode} />
                            <Panel title="This computer">
                                <Text size="sm" c="dimmed">
                                    A players' window on this computer (e.g. on a second display)
                                    follows the panel by itself.
                                </Text>
                                <Group>
                                    <Button variant="light" onClick={() => openPlayers(name)}>
                                        Open a players' window
                                    </Button>
                                </Group>
                            </Panel>
                        </SimpleGrid>
                    </Tabs.Panel>
                </Box>
            </Tabs>
        </Box>
    );
}

/** Opens a players' window on this computer (or brings the open one forward). */
function openPlayers(program: string): void {
    window.open(`?data=${encodeURIComponent(program)}`, `teletronix-${program}`);
}

/** The pairing code last used for a program, so the panel reconnects after a reload. */
function savedCode(program: string): string {
    try {
        return localStorage.getItem(`teletronix:gm-code:${program}`) ?? "";
    } catch {
        return "";
    }
}

function rememberCode(program: string, code: string): void {
    try {
        if (code) localStorage.setItem(`teletronix:gm-code:${program}`, code);
        else localStorage.removeItem(`teletronix:gm-code:${program}`);
    } catch {
        // not remembered
    }
}

const NETWORK: Record<LinkStatus, { text: string; color: string }> = {
    connecting: { text: "Connecting…", color: "yellow" },
    connected: { text: "Connected", color: "green" },
    unavailable: {
        text: "Can't connect: serve Teletronix with npm run table (or npm run dev -- --host)",
        color: "red",
    },
};

/** Pairing with a terminal on another device, by the code it shows. */
function Pairing({
    code,
    network,
    pair,
}: {
    code: string;
    network: LinkStatus | null;
    pair: (code: string) => void;
}) {
    const [typed, setTyped] = useState(code);
    const submit = (event: FormEvent) => {
        event.preventDefault();
        pair(cleanCode(typed));
    };
    if (code) {
        return (
            <Group gap="xs" className="gm-pairing">
                <Text size="sm">
                    Paired with <strong>{code}</strong>
                </Text>
                {network && (
                    <Badge color={NETWORK[network].color} variant="light">
                        {NETWORK[network].text}
                    </Badge>
                )}
                <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => {
                        setTyped("");
                        pair("");
                    }}
                >
                    Unpair
                </Button>
            </Group>
        );
    }
    return (
        <form className="gm-pairing" onSubmit={submit}>
            <Group gap={6}>
                <TextInput
                    size="xs"
                    aria-label="Another device's code"
                    placeholder="Device code"
                    value={typed}
                    onChange={(event) => setTyped(cleanCode(event.currentTarget.value))}
                    autoComplete="off"
                    spellCheck={false}
                    w={110}
                    styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
                />
                <Button
                    type="submit"
                    size="xs"
                    variant="light"
                    disabled={typed.length < CODE_LENGTH}
                >
                    Pair
                </Button>
            </Group>
        </form>
    );
}

function Status({
    count,
    state,
    program,
    name,
}: {
    count: number;
    state: PlayerState | null;
    program: Program;
    name: string;
}) {
    if (count === 0 || !state) {
        return (
            <Group gap="xs" role="status">
                <Badge color="gray" variant="dot">
                    No players
                </Badge>
                <Text size="sm" c="dimmed">
                    No players' window is open.
                </Text>
                <Button size="compact-xs" variant="light" onClick={() => openPlayers(name)}>
                    Open one
                </Button>
            </Group>
        );
    }
    const screen = state.screen === null ? null : program.screens.get(state.screen);
    return (
        <Group gap="xs" role="status">
            <Badge color="green" variant="dot" className="gm-live">
                Live
            </Badge>
            <Text size="sm">
                Players on{" "}
                <strong>{screen ? (screen.title ?? screen.id.toUpperCase()) : "—"}</strong>{" "}
                {screen && <Code>{screen.id}</Code>}
                {state.dialog && (
                    <>
                        {" "}
                        · dialog <Code>{state.dialog}</Code>
                    </>
                )}
                {count > 1 && <> · {count} windows</>}
            </Text>
        </Group>
    );
}

/** Every screen, under its parent: a click sends the players there. */
function ScreenTree({
    program,
    current,
    go,
}: {
    program: Program;
    current: string | null;
    go: (screen: string) => void;
}) {
    const [filter, setFilter] = useState("");
    const children = useMemo(() => {
        const map = new Map<string | undefined, string[]>();
        for (const screen of program.screens.values()) {
            const parent = screen.parent;
            map.set(parent, [...(map.get(parent) ?? []), screen.id]);
        }
        return map;
    }, [program]);

    // folders open by hand, and those the players' screen is in
    const [open, setOpen] = useState(new Set<string>());
    useEffect(() => {
        const path: string[] = [];
        for (
            let id = current ?? undefined;
            id !== undefined;
            id = program.screens.get(id)?.parent
        ) {
            path.push(id);
        }
        setOpen((was) => new Set([...was, ...path]));
    }, [current, program]);
    const toggle = (id: string) =>
        setOpen((was) => {
            const next = new Set(was);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const label = (id: string) => program.screens.get(id)?.title ?? id.toUpperCase();
    const item = (id: string) => (
        <NavLink
            component="button"
            label={label(id)}
            rightSection={<Code fz="xs">{id}</Code>}
            active={id === current}
            aria-current={id === current ? "true" : undefined}
            onClick={() => go(id)}
            py={4}
            style={{ flex: 1, borderRadius: "var(--mantine-radius-sm)" }}
        />
    );
    const branch = (parent: string | undefined, depth: number): React.ReactNode =>
        (children.get(parent) ?? []).map((id) => {
            const kids = children.get(id);
            return (
                <div key={id}>
                    <Group gap={2} wrap="nowrap" pl={depth * 18}>
                        {kids ? (
                            <UnstyledButton
                                className="gm-toggle"
                                aria-label={`${open.has(id) ? "Hide" : "Show"} the screens under ${label(id)}`}
                                aria-expanded={open.has(id)}
                                onClick={() => toggle(id)}
                            >
                                {open.has(id) ? "▾" : "▸"}
                            </UnstyledButton>
                        ) : (
                            <span className="gm-toggle" />
                        )}
                        {item(id)}
                    </Group>
                    {kids && <Collapse expanded={open.has(id)}>{branch(id, depth + 1)}</Collapse>}
                </div>
            );
        });

    const query = filter.trim().toLowerCase();
    const found = query
        ? [...program.screens.values()].filter(
              (screen) =>
                  screen.id.toLowerCase().includes(query) ||
                  (screen.title ?? "").toLowerCase().includes(query),
          )
        : [];
    return (
        <Stack gap="sm">
            <TextInput
                type="search"
                placeholder="Find a screen"
                aria-label="Find a screen"
                value={filter}
                onChange={(event) => setFilter(event.currentTarget.value)}
            />
            <Card withBorder padding="xs" component="nav" aria-label="Screens">
                {query
                    ? found.map((screen) => <div key={screen.id}>{item(screen.id)}</div>)
                    : branch(undefined, 0)}
                {query && found.length === 0 && (
                    <Text size="sm" c="dimmed" p="xs">
                        No screen matches.
                    </Text>
                )}
            </Card>
        </Stack>
    );
}

function Transmit({ send }: { send: (message: GmMessage) => void }) {
    const [text, setText] = useState("");
    const [dismiss, setDismiss] = useState("");
    const [alert, setAlert] = useState(false);
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!text.trim()) return;
        send({ type: "transmit", text, ...(dismiss ? { dismiss } : {}), alert });
        setText("");
    };
    return (
        <Panel title="Transmit">
            <form onSubmit={submit}>
                <Stack gap="sm">
                    <Textarea
                        label="Message"
                        placeholder="MOTHER: CREW EXPENDABLE."
                        autosize
                        minRows={3}
                        value={text}
                        onChange={(event) => setText(event.currentTarget.value)}
                        onKeyDown={(event) => {
                            // Cmd/Ctrl+Enter sends
                            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                                submit(event);
                            }
                        }}
                        styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
                    />
                    <Group align="end" justify="space-between">
                        <Group align="end">
                            <TextInput
                                label="Button"
                                placeholder="OK"
                                value={dismiss}
                                onChange={(event) => setDismiss(event.currentTarget.value)}
                                w={120}
                            />
                            <Checkbox
                                label="Alert colour"
                                color="red"
                                checked={alert}
                                onChange={(event) => setAlert(event.currentTarget.checked)}
                                mb={8}
                            />
                        </Group>
                        <Button type="submit" disabled={!text.trim()}>
                            Send
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Panel>
    );
}

function Dialogs({
    program,
    open,
    go,
    close,
}: {
    program: Program;
    open: string | null;
    go: (dialog: string) => void;
    close: () => void;
}) {
    return (
        <Panel title="Dialogs">
            {program.dialogs.size === 0 ? (
                <Text size="sm" c="dimmed">
                    This program has none.
                </Text>
            ) : (
                <Group gap="xs">
                    {[...program.dialogs.keys()].map((id) => (
                        <Button
                            key={id}
                            size="xs"
                            variant={id === open ? "filled" : "light"}
                            aria-current={id === open ? "true" : undefined}
                            onClick={() => go(id)}
                        >
                            {id}
                        </Button>
                    ))}
                </Group>
            )}
            <Group>
                <Button variant="default" size="xs" disabled={open === null} onClick={close}>
                    Close the open dialog
                </Button>
            </Group>
        </Panel>
    );
}

function Variables({
    program,
    state,
    set,
}: {
    program: Program;
    state: PlayerState | null;
    set: (set: Record<string, VariableValue>) => void;
}) {
    const names = [...program.variables.keys()];
    return (
        <Panel title="Variables">
            {names.length === 0 ? (
                <Text size="sm" c="dimmed">
                    This program has none.
                </Text>
            ) : (
                <Table verticalSpacing={4} highlightOnHover>
                    <Table.Tbody>
                        {names.map((name) => {
                            const initial = program.variables.get(name) as VariableValue;
                            const value = state?.variables[name] ?? initial;
                            return (
                                <Table.Tr key={name}>
                                    <Table.Th fw="normal" w="40%">
                                        <Code>{name}</Code>
                                    </Table.Th>
                                    <Table.Td>
                                        <VariableInput
                                            name={name}
                                            value={value}
                                            disabled={!state}
                                            set={(next) => set({ [name]: next })}
                                        />
                                    </Table.Td>
                                </Table.Tr>
                            );
                        })}
                    </Table.Tbody>
                </Table>
            )}
        </Panel>
    );
}

/** An editor for a variable's value: a switch, a number, or text, set on Enter. */
function VariableInput({
    name,
    value,
    disabled,
    set,
}: {
    name: string;
    value: VariableValue;
    disabled: boolean;
    set: (value: VariableValue) => void;
}) {
    const [draft, setDraft] = useState<string | number | null>(null);
    if (typeof value === "boolean") {
        return (
            <Switch
                aria-label={name}
                checked={value}
                disabled={disabled}
                onChange={(event) => set(event.currentTarget.checked)}
            />
        );
    }
    const commit = () => {
        if (draft === null) return;
        if (typeof value === "number") {
            const number = Number(draft);
            if (String(draft).trim() !== "" && Number.isFinite(number)) set(number);
        } else {
            set(String(draft));
        }
        setDraft(null);
    };
    const keys = (event: React.KeyboardEvent) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setDraft(null);
    };
    if (typeof value === "number") {
        return (
            <NumberInput
                size="xs"
                aria-label={name}
                value={draft ?? value}
                disabled={disabled}
                onChange={setDraft}
                onBlur={commit}
                onKeyDown={keys}
            />
        );
    }
    return (
        <TextInput
            size="xs"
            aria-label={name}
            value={draft ?? value}
            disabled={disabled}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commit}
            onKeyDown={keys}
        />
    );
}

function Timers({
    program,
    state,
    action,
}: {
    program: Program;
    state: PlayerState | null;
    action: (action: object) => void;
}) {
    const names = [...program.timers.keys()];
    if (names.length === 0) return null;
    return (
        <Panel title="Timers">
            <Table verticalSpacing="xs">
                <Table.Tbody>
                    {names.map((name) => {
                        const timer = state?.timers[name];
                        return (
                            <Table.Tr key={name}>
                                <Table.Th fw="normal">
                                    <Code>{name}</Code>
                                </Table.Th>
                                <Table.Td className="gm-timer">
                                    <Group gap="xs" wrap="nowrap">
                                        <Text ff="monospace" fz="xl" fw={700}>
                                            {timer?.seconds ?? "—"}s
                                        </Text>
                                        <Badge
                                            size="sm"
                                            variant="light"
                                            color={timer?.running ? "green" : "gray"}
                                        >
                                            {timer?.running ? "▶ running" : "■ stopped"}
                                        </Badge>
                                    </Group>
                                </Table.Td>
                                <Table.Td>
                                    <Button.Group>
                                        {(
                                            [
                                                ["Start", "startTimer"],
                                                ["Stop", "stopTimer"],
                                                ["Reset", "resetTimer"],
                                            ] as const
                                        ).map(([label, key]) => (
                                            <Button
                                                key={key}
                                                size="xs"
                                                variant="default"
                                                disabled={!state}
                                                onClick={() => action({ [key]: name })}
                                            >
                                                {label}
                                            </Button>
                                        ))}
                                    </Button.Group>
                                </Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
        </Panel>
    );
}

function Effects({
    effects,
    change,
    burst,
}: {
    effects: Partial<Record<EffectName, Override>>;
    change: (effects: Partial<Record<EffectName, Override>>) => void;
    burst: () => void;
}) {
    return (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Panel title="Effects">
                <Table verticalSpacing="xs">
                    <Table.Tbody>
                        {(Object.keys(EFFECTS) as EffectName[]).map((effect) => (
                            <Table.Tr key={effect}>
                                <Table.Th fw="normal" tt="capitalize">
                                    {effect}
                                </Table.Th>
                                <Table.Td>
                                    <SegmentedControl
                                        size="xs"
                                        aria-label={effect}
                                        value={effects[effect] ?? "program"}
                                        onChange={(value) =>
                                            change({ ...effects, [effect]: value as Override })
                                        }
                                        data={[
                                            { label: "As the program says", value: "program" },
                                            { label: "On", value: "on" },
                                            { label: "Off", value: "off" },
                                        ]}
                                    />
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Panel>
            <Panel title="Static">
                <Text size="sm" c="dimmed">
                    A moment of heavy static on the players' screen, with its hiss.
                </Text>
                <Button color="red" size="lg" onClick={burst}>
                    Burst of static
                </Button>
            </Panel>
        </SimpleGrid>
    );
}
