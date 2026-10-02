import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EFFECTS, type EffectName, type Program, type VariableValue } from "../engine/index.ts";
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

    return (
        <div className="gm">
            <header className="gm-header">
                <h1>{program.config.name}</h1>
                <Status count={live.length} state={latest} program={program} name={name} />
                <Pairing code={code} network={network} pair={setCode} />
            </header>
            <main className="gm-panels">
                <section className="gm-panel gm-screens">
                    <h2>Screens</h2>
                    <div className="gm-row">
                        <button type="button" onClick={() => action({ back: true })}>
                            ← Back
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (confirm("Restart the program from the start screen?")) {
                                    action({ restart: true });
                                }
                            }}
                        >
                            Restart
                        </button>
                    </div>
                    <ScreenTree
                        program={program}
                        current={latest?.screen ?? null}
                        go={(screen) => action({ screen })}
                    />
                </section>
                <div className="gm-column">
                    <AddDevice program={name} code={code} pair={setCode} />
                    <Transmit send={send} />
                    <Dialogs
                        program={program}
                        open={latest?.dialog ?? null}
                        go={(dialog) => action({ dialog })}
                        close={() => send({ type: "close-dialog" })}
                    />
                    <Variables program={program} state={latest} set={(set) => action({ set })} />
                    <Timers program={program} state={latest} action={action} />
                    <Effects
                        effects={effects}
                        change={(next) => {
                            setEffects(next);
                            sendEffects(next);
                        }}
                        burst={() => send({ type: "burst", ms: BURST_MS })}
                    />
                </div>
            </main>
        </div>
    );
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

const NETWORK_TEXT: Record<LinkStatus, string> = {
    connecting: "Connecting…",
    connected: "Connected",
    unavailable: "Can't connect: serve Teletronix with npm run table (or npm run dev -- --host)",
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
            <p className="gm-pairing">
                Paired with <strong>{code}</strong>
                {network && (
                    <span className={`gm-network gm-network-${network}`}>
                        {" "}
                        · {NETWORK_TEXT[network]}
                    </span>
                )}{" "}
                <button
                    type="button"
                    onClick={() => {
                        setTyped("");
                        pair("");
                    }}
                >
                    Unpair
                </button>
            </p>
        );
    }
    return (
        <form className="gm-pairing" onSubmit={submit}>
            <label>
                Another device's code{" "}
                <input
                    value={typed}
                    onChange={(event) => setTyped(cleanCode(event.target.value))}
                    placeholder="K7QX"
                    size={6}
                    autoComplete="off"
                    spellCheck={false}
                />
            </label>{" "}
            <button type="submit" disabled={typed.length < CODE_LENGTH}>
                Pair
            </button>
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
    const open = () => window.open(`?data=${encodeURIComponent(name)}`, `teletronix-${name}`);
    if (count === 0 || !state) {
        return (
            <p className="gm-status gm-status-off" role="status">
                <span aria-hidden="true">○</span> No players' window is open.{" "}
                <button type="button" onClick={open}>
                    Open one
                </button>
            </p>
        );
    }
    const screen = state.screen === null ? null : program.screens.get(state.screen);
    return (
        <p className="gm-status gm-status-on" role="status">
            <span aria-hidden="true">●</span> Players on{" "}
            <strong>{screen ? (screen.title ?? screen.id.toUpperCase()) : "—"}</strong>
            {screen && <code>{screen.id}</code>}
            {state.dialog && (
                <>
                    {" "}
                    · dialog <code>{state.dialog}</code>
                </>
            )}
            {count > 1 && <> · {count} windows</>}
        </p>
    );
}

/** Every screen, under its parent, each a button that sends the players there. */
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
    // the folders to open: those the current screen is in
    const path = new Set<string>();
    for (let id = current ?? undefined; id !== undefined; id = program.screens.get(id)?.parent) {
        path.add(id);
    }
    const label = (id: string) => program.screens.get(id)?.title ?? id.toUpperCase();
    const button = (id: string) => (
        <button
            type="button"
            className="gm-screen"
            aria-current={id === current ? "true" : undefined}
            onClick={() => go(id)}
        >
            {label(id)} <code>{id}</code>
        </button>
    );

    const branch = (parent: string | undefined): React.ReactNode => (
        <ul>
            {(children.get(parent) ?? []).map((id) => {
                const kids = children.get(id);
                return (
                    <li key={id}>
                        {kids ? (
                            <details open={path.has(id) || undefined}>
                                <summary>{button(id)}</summary>
                                {branch(id)}
                            </details>
                        ) : (
                            button(id)
                        )}
                    </li>
                );
            })}
        </ul>
    );

    const query = filter.trim().toLowerCase();
    const found = query
        ? [...program.screens.values()].filter(
              (screen) =>
                  screen.id.toLowerCase().includes(query) ||
                  (screen.title ?? "").toLowerCase().includes(query),
          )
        : [];
    return (
        <>
            <input
                type="search"
                className="gm-filter"
                placeholder="Find a screen"
                aria-label="Find a screen"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
            />
            <nav className="gm-tree" aria-label="Screens">
                {query ? (
                    <ul>
                        {found.map((screen) => (
                            <li key={screen.id}>{button(screen.id)}</li>
                        ))}
                    </ul>
                ) : (
                    branch(undefined)
                )}
            </nav>
        </>
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
        <section className="gm-panel">
            <h2>Transmit</h2>
            <form onSubmit={submit} className="gm-form">
                <textarea
                    aria-label="Message"
                    placeholder="MOTHER: CREW EXPENDABLE."
                    rows={3}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={(event) => {
                        // Cmd/Ctrl+Enter sends
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
                            submit(event);
                    }}
                />
                <div className="gm-row">
                    <input
                        aria-label="Button"
                        placeholder="OK"
                        value={dismiss}
                        onChange={(event) => setDismiss(event.target.value)}
                        size={8}
                    />
                    <label>
                        <input
                            type="checkbox"
                            checked={alert}
                            onChange={(event) => setAlert(event.target.checked)}
                        />{" "}
                        Alert colour
                    </label>
                    <button type="submit" disabled={!text.trim()}>
                        Send
                    </button>
                </div>
            </form>
        </section>
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
        <section className="gm-panel">
            <h2>Dialogs</h2>
            <div className="gm-row gm-wrap">
                {[...program.dialogs.keys()].map((id) => (
                    <button
                        key={id}
                        type="button"
                        aria-current={id === open ? "true" : undefined}
                        onClick={() => go(id)}
                    >
                        {id}
                    </button>
                ))}
                {program.dialogs.size === 0 && <p className="gm-none">This program has none.</p>}
            </div>
            <button type="button" disabled={open === null} onClick={close}>
                Close the open dialog
            </button>
        </section>
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
        <section className="gm-panel">
            <h2>Variables</h2>
            {names.length === 0 ? (
                <p className="gm-none">This program has none.</p>
            ) : (
                <table className="gm-table">
                    <tbody>
                        {names.map((name) => {
                            const initial = program.variables.get(name) as VariableValue;
                            const value = state?.variables[name] ?? initial;
                            return (
                                <tr key={name}>
                                    <th scope="row">
                                        <code>{name}</code>
                                    </th>
                                    <td>
                                        <VariableInput
                                            name={name}
                                            value={value}
                                            disabled={!state}
                                            set={(next) => set({ [name]: next })}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </section>
    );
}

/** An editor for a variable's value: a checkbox, a number, or text, set on Enter. */
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
    const [draft, setDraft] = useState<string | null>(null);
    if (typeof value === "boolean") {
        return (
            <input
                type="checkbox"
                aria-label={name}
                checked={value}
                disabled={disabled}
                onChange={(event) => set(event.target.checked)}
            />
        );
    }
    const commit = () => {
        if (draft === null) return;
        if (typeof value === "number") {
            const number = Number(draft);
            if (draft.trim() !== "" && Number.isFinite(number)) set(number);
        } else {
            set(draft);
        }
        setDraft(null);
    };
    return (
        <input
            type={typeof value === "number" ? "number" : "text"}
            aria-label={name}
            value={draft ?? String(value)}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
                if (event.key === "Enter") commit();
                if (event.key === "Escape") setDraft(null);
            }}
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
        <section className="gm-panel">
            <h2>Timers</h2>
            <table className="gm-table">
                <tbody>
                    {names.map((name) => {
                        const timer = state?.timers[name];
                        return (
                            <tr key={name}>
                                <th scope="row">
                                    <code>{name}</code>
                                </th>
                                <td className="gm-timer">
                                    {timer?.seconds ?? "—"}s {timer?.running ? "▶" : "■"}
                                </td>
                                <td className="gm-row">
                                    <button
                                        type="button"
                                        disabled={!state}
                                        onClick={() => action({ startTimer: name })}
                                    >
                                        Start
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!state}
                                        onClick={() => action({ stopTimer: name })}
                                    >
                                        Stop
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!state}
                                        onClick={() => action({ resetTimer: name })}
                                    >
                                        Reset
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </section>
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
        <section className="gm-panel">
            <h2>Effects</h2>
            <table className="gm-table">
                <tbody>
                    {(Object.keys(EFFECTS) as EffectName[]).map((effect) => (
                        <tr key={effect}>
                            <th scope="row">{effect}</th>
                            <td>
                                <select
                                    aria-label={effect}
                                    value={effects[effect] ?? "program"}
                                    onChange={(event) =>
                                        change({
                                            ...effects,
                                            [effect]: event.target.value as Override,
                                        })
                                    }
                                >
                                    <option value="program">As the program says</option>
                                    <option value="on">On</option>
                                    <option value="off">Off</option>
                                </select>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <button type="button" onClick={burst}>
                Burst of static
            </button>
        </section>
    );
}
