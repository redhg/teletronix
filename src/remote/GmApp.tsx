import {
    Alert,
    Badge,
    Box,
    Button,
    Checkbox,
    Code,
    Group,
    NumberInput,
    SegmentedControl,
    Select,
    SimpleGrid,
    Stack,
    Switch,
    Table,
    Tabs,
    Text,
    Textarea,
    TextInput,
    Title,
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
import { type CommandGroup, Palette, PaletteButton } from "../mantine/Palette.tsx";
import { Panel } from "../mantine/Panel.tsx";
import { ScreenTree } from "../mantine/ScreenTree.tsx";
import { Version } from "../mantine/Version.tsx";
import { AddDevice } from "./AddDevice.tsx";
import { newJoinCode, newSecret } from "./codes.ts";
import { GONE_MS, HEARTBEAT_MS } from "./follow.ts";
import { type Handout, handoutsOf } from "./handouts.ts";
import { channelLink, type Link, type LinkStatus, randomId, sessionLink } from "./link.ts";
import { Players, SendTo } from "./Players.tsx";
import { answerFor, type ShareTarget, sendPackage } from "./packages-share.ts";
import {
    BUILTIN_SOUNDS,
    type BuiltinSound,
    type GmEnvelope,
    type GmMessage,
    type PlayerMessage,
    type PlayerState,
} from "./protocol.ts";
import { isLocalHost } from "./relay-address.ts";
import type { Refusal } from "./relay-protocol.ts";
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
    // who the panel's sending to: every players' window, or one (by its id)
    const [target, setTarget] = useState<string | null>(null);
    const targetRef = useRef(target);
    targetRef.current = target;
    // the session's players' windows (the relay's list), kept for sending
    const devicesRef = useRef<string[]>([]);
    /** Sends to every players' window, or one: by default, the one chosen to send to. */
    const send = useCallback((message: GmMessage, to: string | null = targetRef.current) => {
        const envelope: GmEnvelope = { ...message, id: randomId(), ...(to ? { to } : {}) };
        for (const [kind, link] of links.current) {
            // (to one of the session's: through the relay to it alone; to one in this browser,
            // not through the relay at all)
            if (to && kind === "relay") {
                if (devicesRef.current.includes(to)) relay.current?.sendTo(to, envelope);
                continue;
            }
            link.send(envelope);
        }
    }, []);

    // the players' windows, by id, with when each last reported in
    const [players, setPlayers] = useState(new Map<string, { state: PlayerState; at: number }>());
    const [now, setNow] = useState(() => Date.now());
    const [effects, setEffects] = useState<Partial<Record<EffectName, Override>>>({});
    const effectsRef = useRef(effects);
    effectsRef.current = effects;
    // ambience over the program's: an audio file, false for silence, null for the program's
    const [ambience, setAmbience] = useState<string | false | null>(null);
    const ambienceRef = useRef(ambience);
    ambienceRef.current = ambience;

    const sendEffects = useCallback(
        (overrides: Partial<Record<EffectName, Override>>, to?: string) => {
            const setting = Object.fromEntries(
                Object.entries(overrides)
                    .filter(([, value]) => value !== "program")
                    .map(([effect, value]) => [effect, value === "on"]),
            );
            send(
                { type: "effects", effects: Object.keys(setting).length > 0 ? setting : null },
                to,
            );
        },
        [send],
    );

    // the session's link, to send one player something (e.g. the package)
    const relay = useRef<ShareTarget | null>(null);
    // packages going to players' windows that hadn't got them: how far each has got (0 to 1)
    const [sharing, setSharing] = useState(new Map<string, number>());
    const sharePackage = useCallback(
        (message: PlayerMessage) => {
            const link = relay.current;
            if (message.type === "state" || message.type === "program-wanted" || !link) return;
            const { player } = message;
            if (message.type === "package-wanted") {
                void answerFor(name, message.package).then((answer) =>
                    link.sendTo(player, { ...answer, id: randomId() }),
                );
                return;
            }
            void answerFor(name, message.package).then((answer) => {
                if (answer.type !== "package-offer") return;
                setSharing((was) => new Map(was).set(player, 0));
                void sendPackage(link, player, name, (sent, count) =>
                    setSharing((was) => {
                        const next = new Map(was);
                        if (sent === count) next.delete(player);
                        else next.set(player, sent / count);
                        return next;
                    }),
                );
            });
        },
        [name],
    );

    const known = useRef(new Set<string>());
    const receive = useCallback(
        (message: { type: string }) => {
            if (message.type === "package-wanted" || message.type === "package-accepted") {
                sharePackage(message as PlayerMessage);
                return;
            }
            if (message.type === "program-wanted") {
                const { player } = message as Extract<PlayerMessage, { type: "program-wanted" }>;
                relay.current?.sendTo(player, { type: "program", program: name, id: randomId() });
                return;
            }
            if (message.type !== "state") return;
            const { player, state } = message as Extract<PlayerMessage, { type: "state" }>;
            // a new window gets the effects (and ambience) the panel has on: it alone
            if (!known.current.has(player)) {
                known.current.add(player);
                sendEffects(effectsRef.current, player);
                if (ambienceRef.current !== null) {
                    send({ type: "ambience", ambience: ambienceRef.current }, player);
                }
            }
            setPlayers((was) => new Map(was).set(player, { state, at: Date.now() }));
        },
        [sendEffects, send, sharePackage, name],
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

    // and on other devices, in the panel's session, which they join by its code
    const [session, setSession] = useState(() => savedSession(name));
    const [network, setNetwork] = useState<LinkStatus | null>(null);
    const [refused, setRefused] = useState<Refusal | null>(null);
    const [devices, setDevices] = useState<string[]>([]);
    const remove = useRef<(player: string) => void>(() => {});
    useEffect(() => {
        rememberSession(name, session);
        setDevices([]);
        if (!session) {
            setNetwork(null);
            return;
        }
        setRefused(null);
        const link = sessionLink(
            { gm: session },
            receive,
            (status) => {
                setNetwork(status);
                if (status === "connected") {
                    link.send({ type: "hello", id: randomId() } satisfies GmEnvelope);
                }
            },
            {
                players: (ids) => {
                    devicesRef.current = ids;
                    setDevices(ids);
                },
                refused: setRefused,
            },
        );
        links.current.set("relay", link);
        relay.current = link;
        remove.current = link.remove;
        return () => {
            link.close();
            if (links.current.get("relay") === link) links.current.delete("relay");
            if (relay.current === link) relay.current = null;
        };
    }, [name, session, receive]);
    const startSession = () => setSession({ code: newJoinCode(), secret: newSecret() });

    // the players' windows in this browser know the panel's there, and it knows when they've
    // gone, by heartbeats through the channel (a session's relay says who's there itself)
    useEffect(() => {
        const timer = setInterval(() => {
            links.current
                .get("channel")
                ?.send({ type: "ping", id: randomId() } satisfies GmEnvelope);
            setNow(Date.now());
        }, HEARTBEAT_MS);
        return () => clearInterval(timer);
    }, []);

    // the players' windows still there, in the order they first reported in (the Map's): ones
    // that reported in lately, through the channel, and the session's (the relay says who's
    // there; they only report changes)
    const liveIds = [...players]
        .filter(([id, player]) => now - player.at < GONE_MS || devices.includes(id))
        .map(([id]) => id);
    const live = liveIds.flatMap((id) => players.get(id) ?? []);
    // (the one chosen to send to, gone: back to every one)
    useEffect(() => {
        if (target !== null && !liveIds.includes(target)) setTarget(null);
    });
    // the panel follows one of them, steadily: the one it's sending to, or the first still
    // there (windows on different screens report in turn, and following the latest would
    // flick between them)
    const followed = target !== null ? players.get(target) : live[0];
    const latest = followed?.state ?? null;
    // every screen they're on (or the one it's sending to is), each once, in that order
    const screensOn = [
        ...new Set(
            (target !== null && followed ? [followed] : live).flatMap(({ state }) =>
                state.screen === null ? [] : [state.screen],
            ),
        ),
    ];

    // players' windows' names: the GM's own, kept, or "Player 1", "Player 2"… by when each
    // first reported in
    const [names, setNames] = useLocalStorage<Record<string, string>>({
        key: `teletronix:gm-names:${name}`,
        defaultValue: {},
    });
    const nameOf = (id: string) =>
        names[id]?.trim() || `Player ${[...players.keys()].indexOf(id) + 1}`;
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

    // ─── Commands (Cmd/Ctrl+K) ───────────────────────────────────────────────

    /** Shows a tab, and puts the cursor in one of its fields. */
    const focusField = (inTab: string, selector: string) => {
        setTab(inTab);
        requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
    };
    const setEffect = (effect: EffectName, value: Override) => {
        const next = { ...effects, [effect]: value };
        setEffects(next);
        sendEffects(next);
    };
    // images and videos to show the players, as the program has them
    const handouts = useMemo(() => handoutsOf(program), [program]);
    const showHandout = (view: unknown) => send({ type: "view", view });
    const playSound = (sound: { sound?: string; builtin?: BuiltinSound; src?: string }) =>
        send({ type: "play", ...sound });

    // pausing the players, under a cover the GM sets up
    const paused = latest?.paused === true;
    const [cover, setCover] = useState<StandByCover>({ message: "", image: "", sound: "" });
    const pause = (with_: StandByCover) =>
        send({
            type: "pause",
            ...(with_.message.trim() ? { message: with_.message.trim() } : {}),
            ...(with_.image ? { image: with_.image } : {}),
            ...(with_.sound ? { sound: with_.sound } : {}),
        });
    const togglePause = () => (paused ? send({ type: "resume" }) : pause(cover));
    const changeCover = (next: StandByCover) => {
        setCover(next);
        // (paused, the players' cover changes at once)
        if (paused) pause(next);
    };

    const changeAmbience = (next: string | false | null) => {
        setAmbience(next);
        send({ type: "ambience", ambience: next });
    };
    const restart = () => {
        if (confirm("Restart the program from the start screen?")) action({ restart: true });
    };
    const commands: CommandGroup[] = [
        {
            group: "Players",
            commands: [
                {
                    id: "back",
                    label: "Back",
                    description: "To the screen before",
                    run: () => action({ back: true }),
                },
                { id: "restart", label: "Restart the program", run: restart },
                {
                    id: "transmit",
                    label: "Transmit a message…",
                    keywords: ["send", "message"],
                    run: () => focusField("messages", "#gm-message"),
                },
                ...(latest?.dialog
                    ? [
                          {
                              id: "close",
                              label: "Close the open dialog",
                              run: () => send({ type: "close-dialog" }),
                          },
                      ]
                    : []),
                {
                    id: "burst",
                    label: "Burst of static",
                    keywords: ["effect"],
                    run: () => send({ type: "burst", ms: BURST_MS }),
                },
                { id: "window", label: "Open a players' window", run: () => openPlayers(name) },
                paused
                    ? {
                          id: "resume",
                          label: "Resume",
                          keywords: ["pause", "unpause"],
                          run: togglePause,
                      }
                    : {
                          id: "pause",
                          label: "Pause the players",
                          description: "Everything stops, under a cover",
                          keywords: ["stand by", "break", "freeze"],
                          run: togglePause,
                      },
            ],
        },
        {
            group: "Go to",
            commands: [...program.screens.values()].map((screen) => ({
                id: screen.id,
                label: screen.title ?? screen.id.toUpperCase(),
                description: `Screen ${screen.id}`,
                keywords: ["screen", screen.id],
                run: () => action({ screen: screen.id }),
            })),
        },
        {
            group: "Dialogs",
            commands: [...program.dialogs.keys()].map((id) => ({
                id,
                label: `Open ${id}`,
                keywords: ["dialog"],
                run: () => action({ dialog: id }),
            })),
        },
        {
            group: "Handouts",
            commands: [
                ...handouts.map((handout) => ({
                    id: handout.src,
                    label: `Show ${fileName(handout.src)}`,
                    description: handout.kind === "video" ? "Video" : "Image",
                    keywords: ["handout", "view", handout.kind, handout.src],
                    run: () => showHandout(handout.view ?? handout.src),
                })),
                ...(latest?.view
                    ? [
                          {
                              id: "@close",
                              label: "Close the image or video",
                              keywords: ["handout", "view"],
                              run: () => send({ type: "close-view" }),
                          },
                      ]
                    : []),
            ],
        },
        {
            group: "Soundboard",
            commands: [
                ...[...new Set([...program.sounds.keys(), ...program.audio.keys()])].map(
                    (sound) => ({
                        id: sound,
                        label: `Play ${sound}`,
                        keywords: ["sound", "soundboard"],
                        run: () => playSound({ sound }),
                    }),
                ),
                ...(Object.entries(BUILTIN_SOUNDS) as [BuiltinSound, string][]).map(
                    ([builtin, label]) => ({
                        id: `@${builtin}`,
                        label: `Play ${label.toLowerCase()}`,
                        description: "Teletronix's own",
                        keywords: ["sound", "soundboard"],
                        run: () => playSound({ builtin }),
                    }),
                ),
                {
                    id: "@stop",
                    label: "Stop all",
                    description: "Closes what's showing, stops the sounds playing",
                    keywords: ["media", "sound", "silence"],
                    run: () => send({ type: "stop-media" }),
                },
            ],
        },
        {
            group: "Variables",
            commands: [...program.variables.entries()].map(([variable, initial]) => {
                const value = latest?.variables[variable] ?? initial;
                return typeof value === "boolean"
                    ? {
                          id: variable,
                          label: `Set ${variable} to ${!value}`,
                          keywords: ["variable", "toggle"],
                          run: () => action({ set: { [variable]: !value } }),
                      }
                    : {
                          id: variable,
                          label: `Change ${variable}…`,
                          description: `Now ${JSON.stringify(value)}`,
                          keywords: ["variable", "set"],
                          run: () =>
                              focusField("variables", `[aria-label="${CSS.escape(variable)}"]`),
                      };
            }),
        },
        {
            group: "Timers",
            commands: [...program.timers.keys()].flatMap((timer) =>
                (
                    [
                        ["Start", "startTimer"],
                        ["Stop", "stopTimer"],
                        ["Reset", "resetTimer"],
                    ] as const
                ).map(([verb, key]) => ({
                    id: `${key}:${timer}`,
                    label: `${verb} ${timer}`,
                    keywords: ["timer", "clock"],
                    run: () => action({ [key]: timer }),
                })),
            ),
        },
        {
            group: "Effects",
            commands: (Object.keys(EFFECTS) as EffectName[]).flatMap((effect) =>
                (
                    [
                        ["on", "on"],
                        ["off", "off"],
                        ["program", "as the program says"],
                    ] as const
                ).map(([value, words]) => ({
                    id: `${effect}:${value}`,
                    label: `${effect[0]?.toUpperCase()}${effect.slice(1)} ${words}`,
                    keywords: ["effect"],
                    run: () => setEffect(effect, value),
                })),
            ),
        },
        {
            group: "Ambience",
            commands:
                program.audio.size === 0
                    ? []
                    : [
                          ...[...program.audio.keys()].map((name) => ({
                              id: name,
                              label: `Ambience: ${name}`,
                              keywords: ["sound", "background", "loop"],
                              run: () => changeAmbience(name),
                          })),
                          {
                              id: "@silence",
                              label: "Ambience: silence",
                              keywords: ["sound", "quiet", "off"],
                              run: () => changeAmbience(false),
                          },
                          {
                              id: "@program",
                              label: "Ambience as the program says",
                              keywords: ["sound"],
                              run: () => changeAmbience(null),
                          },
                      ],
        },
        {
            group: "Tabs",
            commands: TABS.map(([value, label]) => ({
                id: value,
                label: `Show ${label}`,
                keywords: ["tab"],
                run: () => setTab(value),
            })),
        },
    ];

    return (
        <Box
            className="gm"
            style={{ "--gm-header-height": `${headerHeight}px` } as React.CSSProperties}
        >
            <Palette
                groups={commands}
                placeholder="Go to a screen, open a dialog, start a timer…"
            />
            <Box ref={header} component="header" className="gm-header" px="lg" py="sm">
                <Group justify="space-between" gap="sm">
                    <Group gap="md">
                        <Title order={3}>{program.config.name}</Title>
                        <Status
                            count={target !== null ? 1 : live.length}
                            state={latest}
                            screens={screensOn}
                            program={program}
                            name={name}
                        />
                        {live.length > 1 || target !== null ? (
                            <SendTo
                                target={target}
                                choose={setTarget}
                                windows={liveIds.map((id) => ({ id, name: nameOf(id) }))}
                            />
                        ) : null}
                    </Group>
                    <Group gap="sm">
                        <PaletteButton />
                        <Button.Group>
                            <Button
                                variant="default"
                                size="xs"
                                onClick={() => action({ back: true })}
                            >
                                ← Back
                            </Button>
                            <Button variant="default" size="xs" onClick={restart}>
                                Restart
                            </Button>
                        </Button.Group>
                        <Button
                            size="xs"
                            color={paused ? "yellow" : undefined}
                            variant={paused ? "filled" : "default"}
                            aria-pressed={paused}
                            disabled={!latest}
                            onClick={togglePause}
                        >
                            {paused ? "▶ Resume" : "‖ Pause"}
                        </Button>
                        <SessionControl
                            code={session?.code ?? null}
                            network={network}
                            refused={refused}
                            devices={devices.length}
                            start={startSession}
                            end={() => setSession(null)}
                        />
                        <Version />
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
                    {TABS.map(([value, label]) => (
                        <Tabs.Tab key={value} value={value}>
                            {label}
                        </Tabs.Tab>
                    ))}
                </Tabs.List>
                <Box p="lg">
                    <Tabs.Panel value="screens">
                        <ScreenTree
                            screens={[...program.screens.values()]}
                            current={screensOn}
                            onSelect={(screen) => action({ screen })}
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
                            <StandBy
                                cover={cover}
                                change={changeCover}
                                images={handouts.filter((handout) => handout.kind === "image")}
                                sounds={[...program.audio.keys()]}
                                paused={paused}
                                toggle={togglePause}
                            />
                        </SimpleGrid>
                    </Tabs.Panel>
                    <Tabs.Panel value="media">
                        <Stack>
                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">
                                    Show the players an image or video over their whole screen, or
                                    play them a sound, at any moment.
                                </Text>
                                <Button
                                    color="red"
                                    variant="light"
                                    size="xs"
                                    disabled={!latest}
                                    onClick={() => send({ type: "stop-media" })}
                                >
                                    ■ Stop all
                                </Button>
                            </Group>
                            <SimpleGrid cols={{ base: 1, md: 2 }}>
                                <Handouts
                                    handouts={handouts}
                                    showing={latest?.view ?? null}
                                    show={showHandout}
                                    close={() => send({ type: "close-view" })}
                                />
                                <Soundboard program={program} play={playSound} />
                                <Ambience
                                    program={program}
                                    playing={latest?.ambience ?? null}
                                    value={ambience}
                                    change={changeAmbience}
                                />
                            </SimpleGrid>
                        </Stack>
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
                            <AddDevice
                                program={name}
                                code={session?.code ?? null}
                                start={startSession}
                            />
                            <Players
                                windows={liveIds.map((id) => ({ id, name: nameOf(id) }))}
                                screenOf={(player) => {
                                    const id = players.get(player)?.state.screen;
                                    const screen = id ? program.screens.get(id) : undefined;
                                    return screen
                                        ? (screen.title ?? screen.id.toUpperCase())
                                        : null;
                                }}
                                inSession={(player) => devices.includes(player)}
                                receiving={(player) => sharing.get(player) ?? null}
                                target={target}
                                choose={setTarget}
                                rename={(player, typed) =>
                                    setNames((was) => {
                                        const next = { ...was };
                                        if (typed.trim()) next[player] = typed.trim();
                                        else delete next[player];
                                        return next;
                                    })
                                }
                                remove={(player) => remove.current(player)}
                            />
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

/** The panel's tabs: their values and names. */
const TABS = [
    ["screens", "Screens"],
    ["messages", "Messages"],
    ["media", "Media"],
    ["variables", "Variables"],
    ["effects", "Effects"],
    ["devices", "Devices"],
] as const;

/** Opens a players' window on this computer (or brings the open one forward). */
function openPlayers(program: string): void {
    window.open(`?data=${encodeURIComponent(program)}`, `teletronix-${program}`);
}

/** A session: its join code, and the secret only this panel has. */
interface Session {
    code: string;
    secret: string;
}

const sessionKey = (program: string) => `teletronix:gm-session:${program}`;

/** The session last started for a program, so the panel opens it again after a reload. */
function savedSession(program: string): Session | null {
    try {
        const saved = JSON.parse(localStorage.getItem(sessionKey(program)) ?? "null") as unknown;
        if (saved && typeof saved === "object" && "code" in saved && "secret" in saved) {
            const { code, secret } = saved as Session;
            if (typeof code === "string" && typeof secret === "string") return { code, secret };
        }
    } catch {
        // none
    }
    return null;
}

function rememberSession(program: string, session: Session | null): void {
    try {
        if (session) localStorage.setItem(sessionKey(program), JSON.stringify(session));
        else localStorage.removeItem(sessionKey(program));
    } catch {
        // not remembered
    }
}

const NETWORK: Record<LinkStatus, { text: string; color: string }> = {
    connecting: { text: "Connecting…", color: "yellow" },
    connected: { text: "Connected", color: "green" },
    unavailable: {
        // (served from here, its relay's beside it; online, it's Teletronix's, on the internet)
        text: isLocalHost(location.hostname)
            ? "Can't connect: serve Teletronix with npm run table (or npm run dev -- --host)"
            : "Can't reach Teletronix's relay: check the internet connection",
        color: "red",
    },
    refused: { text: "Not available", color: "red" },
};

/** Why the relay wouldn't open the panel's session. */
const REFUSED: Record<Refusal, string> = {
    taken: "Another GM has this code: end it and start a new session",
    "too-many": "Too many tries: wait a minute",
    invalid: "Not a valid session: end it and start a new one",
    removed: "Removed",
};

/**
 * The panel's session, which players' devices join by its code: started here, then shown
 * with its connection and how many devices have joined.
 */
function SessionControl({
    code,
    network,
    refused,
    devices,
    start,
    end,
}: {
    code: string | null;
    network: LinkStatus | null;
    refused: Refusal | null;
    devices: number;
    start: () => void;
    end: () => void;
}) {
    if (!code) {
        return (
            <Button
                variant="default"
                size="xs"
                className="gm-pairing"
                onClick={start}
                title="Let players' devices join, by a code"
            >
                Start a session
            </Button>
        );
    }
    return (
        <Group gap="xs" className="gm-pairing">
            <Text size="sm">
                Session <strong>{code}</strong>
            </Text>
            {network && (
                <Badge color={NETWORK[network].color} variant="light">
                    {refused ? REFUSED[refused] : NETWORK[network].text}
                </Badge>
            )}
            {network === "connected" && (
                <Text size="sm" c="dimmed">
                    {devices === 1 ? "1 device" : `${devices} devices`}
                </Text>
            )}
            <Button variant="subtle" size="xs" onClick={end}>
                End
            </Button>
        </Group>
    );
}

function Status({
    count,
    state,
    screens,
    program,
    name,
}: {
    count: number;
    /** The window the panel follows */
    state: PlayerState | null;
    /** Every screen a window's on */
    screens: string[];
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
    const titleOf = (id: string) => {
        const screen = program.screens.get(id);
        return screen ? (screen.title ?? screen.id.toUpperCase()) : id.toUpperCase();
    };
    // (windows on different screens: which ones, on hover)
    if (screens.length > 1) {
        return (
            <Group gap="xs" role="status">
                <Badge color="green" variant="dot" className="gm-live">
                    Live
                </Badge>
                <Text size="sm" title={`On ${screens.map(titleOf).join(", ")}`}>
                    Players on <strong>various screens</strong> · {count} windows
                </Text>
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
                        id="gm-message"
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
    children,
}: {
    effects: Partial<Record<EffectName, Override>>;
    change: (effects: Partial<Record<EffectName, Override>>) => void;
    burst: () => void;
    /** More panels, after these */
    children?: React.ReactNode;
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
            {children}
        </SimpleGrid>
    );
}

const PROGRAM = "@program";
const SILENCE = "@silence";

/** The background sound: as the program and screen say, an audio file of its own, or silence. */
function Ambience({
    program,
    playing,
    value,
    change,
}: {
    program: Program;
    /** What the players hear now */
    playing: string | null;
    value: string | false | null;
    change: (ambience: string | false | null) => void;
}) {
    if (program.audio.size === 0) return null;
    return (
        <Panel title="Ambience">
            <Text size="sm" c="dimmed">
                The sound looping in the background: {playing ? <Code>{playing}</Code> : "none"}{" "}
                now.
            </Text>
            <Select
                aria-label="Ambience"
                allowDeselect={false}
                value={value === null ? PROGRAM : value === false ? SILENCE : value}
                onChange={(next) =>
                    change(
                        next === PROGRAM || next === null ? null : next === SILENCE ? false : next,
                    )
                }
                data={[
                    { value: PROGRAM, label: "As the program and screen say" },
                    ...[...program.audio.keys()].map((name) => ({ value: name, label: name })),
                    { value: SILENCE, label: "Silence" },
                ]}
            />
        </Panel>
    );
}

/** A file's name, from its path or address (without any ?query or #part). */
const fileName = (src: string) => src.split(/[?#]/)[0]?.split("/").filter(Boolean).at(-1) ?? src;

/**
 * Images and videos to show the players over their whole screen, whenever the moment comes:
 * the program's own, or any other by its file or address.
 */
function Handouts({
    handouts,
    showing,
    show,
    close,
}: {
    handouts: Handout[];
    /** What the players have open, by its file */
    showing: string | null;
    show: (view: unknown) => void;
    close: () => void;
}) {
    const [other, setOther] = useState("");
    return (
        <Panel title="Handouts">
            <Text size="sm" c="dimmed">
                An image or video over the players' whole screen, until they close it (or you do).
            </Text>
            {handouts.length > 0 && (
                <Group gap="xs">
                    {handouts.map((handout) => (
                        <Button
                            key={handout.src}
                            size="xs"
                            variant={handout.src === showing ? "filled" : "light"}
                            aria-current={handout.src === showing ? "true" : undefined}
                            title={handout.src}
                            onClick={() => show(handout.view ?? handout.src)}
                        >
                            {handout.kind === "video" ? "▶ " : "▣ "}
                            {fileName(handout.src)}
                        </Button>
                    ))}
                </Group>
            )}
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (other.trim()) show(other.trim());
                }}
            >
                <Group gap="xs" align="end">
                    <TextInput
                        size="xs"
                        label="Another"
                        placeholder="data/images/photo.jpg, or a web address"
                        value={other}
                        onChange={(event) => setOther(event.currentTarget.value)}
                        style={{ flex: 1 }}
                    />
                    <Button type="submit" size="xs" variant="light" disabled={!other.trim()}>
                        Show
                    </Button>
                </Group>
            </form>
            <Group>
                <Button variant="default" size="xs" disabled={showing === null} onClick={close}>
                    Close it
                </Button>
            </Group>
        </Panel>
    );
}

/** What covers the players' screen while they're paused: "" for none (or the default). */
interface StandByCover {
    message: string;
    image: string;
    sound: string;
}

/**
 * Pausing the players: everything stops (text, timers, video, ambience) under a cover, with a
 * message, an image behind it and a sound looping, until the GM carries on.
 */
function StandBy({
    cover,
    change,
    images,
    sounds,
    paused,
    toggle,
}: {
    cover: StandByCover;
    change: (cover: StandByCover) => void;
    images: Handout[];
    sounds: string[];
    paused: boolean;
    toggle: () => void;
}) {
    return (
        <Panel title="Stand by">
            <Text size="sm" c="dimmed">
                Pause the players: text stops typing, timers stop counting, videos and ambience
                stop, under a cover, until you carry on.
            </Text>
            <TextInput
                size="xs"
                label="On the cover"
                placeholder="PLEASE STAND BY"
                value={cover.message}
                onChange={(event) => change({ ...cover, message: event.currentTarget.value })}
            />
            <Group gap="xs" grow>
                <Select
                    size="xs"
                    label="Behind it"
                    placeholder="Nothing"
                    clearable
                    data={images.map((image) => ({ value: image.src, label: fileName(image.src) }))}
                    value={cover.image || null}
                    onChange={(image) => change({ ...cover, image: image ?? "" })}
                />
                <Select
                    size="xs"
                    label="Sound"
                    placeholder="Silence"
                    clearable
                    data={sounds}
                    value={cover.sound || null}
                    onChange={(sound) => change({ ...cover, sound: sound ?? "" })}
                />
            </Group>
            <Group>
                <Button
                    size="xs"
                    color={paused ? "yellow" : undefined}
                    variant={paused ? "filled" : "light"}
                    onClick={toggle}
                >
                    {paused ? "▶ Resume" : "‖ Pause now"}
                </Button>
            </Group>
        </Panel>
    );
}

/**
 * Sounds to play the players, over whatever's on their screen: the program's own (generated or
 * audio files), Teletronix's, or any audio file by its address.
 */
function Soundboard({
    program,
    play,
}: {
    program: Program;
    play: (sound: { sound?: string; builtin?: BuiltinSound; src?: string }) => void;
}) {
    const [other, setOther] = useState("");
    const own = [...new Set([...program.sounds.keys(), ...program.audio.keys()])];
    return (
        <Panel title="Soundboard">
            {own.length > 0 && (
                <Group gap="xs">
                    {own.map((name) => (
                        <Button
                            key={name}
                            size="xs"
                            variant="light"
                            title={program.audio.get(name)?.src ?? "A generated sound"}
                            onClick={() => play({ sound: name })}
                        >
                            ▶ {name}
                        </Button>
                    ))}
                </Group>
            )}
            <Group gap="xs">
                {(Object.entries(BUILTIN_SOUNDS) as [BuiltinSound, string][]).map(([id, label]) => (
                    <Button
                        key={id}
                        size="xs"
                        variant="default"
                        onClick={() => play({ builtin: id })}
                    >
                        ▶ {label}
                    </Button>
                ))}
            </Group>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (other.trim()) play({ src: other.trim() });
                }}
            >
                <Group gap="xs" align="end">
                    <TextInput
                        size="xs"
                        label="Another"
                        placeholder="data/audio/klaxon.mp3, or a web address"
                        value={other}
                        onChange={(event) => setOther(event.currentTarget.value)}
                        style={{ flex: 1 }}
                    />
                    <Button type="submit" size="xs" variant="light" disabled={!other.trim()}>
                        Play
                    </Button>
                </Group>
            </form>
        </Panel>
    );
}
