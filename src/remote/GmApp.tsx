import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EFFECTS, type EffectName, type Program, type VariableValue } from "../engine/index.ts";
import { HEARTBEAT_MS } from "./follow.ts";
import {
    channelName,
    type GmMessage,
    isMessage,
    type PlayerMessage,
    type PlayerState,
} from "./protocol.ts";

/** A players' window that hasn't reported in for this long has gone. */
const GONE_MS = HEARTBEAT_MS * 3;
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
    // the channel is made and closed by the same effect (React may run it more than once)
    const channel = useRef<BroadcastChannel | null>(null);
    const send = useCallback((message: GmMessage) => channel.current?.postMessage(message), []);

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
    useEffect(() => {
        const opened = new BroadcastChannel(channelName(name));
        channel.current = opened;
        opened.onmessage = (event: MessageEvent) => {
            if (!isMessage(event.data) || event.data.type !== "state") return;
            const { player, state } = event.data as PlayerMessage;
            // a new window gets the effects the panel has on
            if (!known.current.has(player)) {
                known.current.add(player);
                sendEffects(effectsRef.current);
            }
            setPlayers((was) => new Map(was).set(player, { state, at: Date.now() }));
        };
        opened.postMessage({ type: "hello" } satisfies GmMessage);
        const timer = setInterval(() => setNow(Date.now()), HEARTBEAT_MS);
        return () => {
            clearInterval(timer);
            opened.close();
            if (channel.current === opened) channel.current = null;
        };
    }, [name, sendEffects]);

    const live = [...players.values()].filter((player) => now - player.at < GONE_MS);
    const latest = live.sort((a, b) => b.at - a.at)[0]?.state ?? null;
    const action = (action: object) => send({ type: "action", action });

    return (
        <div className="gm">
            <header className="gm-header">
                <h1>{program.config.name}</h1>
                <Status count={live.length} state={latest} program={program} name={name} />
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
