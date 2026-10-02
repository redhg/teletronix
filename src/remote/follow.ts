import { ActionSchema, type EffectsSetting, type Terminal } from "../engine/index.ts";
import { channelLink, type Link, type LinkStatus, newCode, relayLink } from "./link.ts";
import type { GmEnvelope, PlayerMessage, PlayerState } from "./protocol.ts";

/** How often a players' window reports in, and a panel pings, so each knows the other's there. */
export const HEARTBEAT_MS = 1000;
/** Gone, after this long without a word. */
export const GONE_MS = HEARTBEAT_MS * 3;
/** How heavy a GM's burst of static is. */
const BURST = { static: { opacity: 0.7 } } satisfies EffectsSetting;
/** How many commands' ids to remember, to carry each out once. */
const SEEN = 200;

/** What the terminal is showing, for the panel. */
export function playerState(terminal: Terminal): PlayerState {
    const snapshot = terminal.getSnapshot();
    const { program } = terminal;
    return {
        screen: snapshot.screen?.run.screen.id ?? null,
        dialog: snapshot.dialog?.id ?? null,
        variables: Object.fromEntries(
            [...program.variables.keys()].map((name) => [
                name,
                terminal.variable(name) ?? (program.variables.get(name) as never),
            ]),
        ),
        timers: Object.fromEntries(
            [...program.timers.keys()].map((name) => [
                name,
                {
                    seconds: terminal.variable(name) as number | undefined,
                    running: terminal.timerRunning(name),
                },
            ]),
        ),
    };
}

/** How a terminal's remote control is doing, for its badge. */
export interface RemoteStatus {
    /** Its pairing code, if other devices can reach it */
    code: string | null;
    /** Its link to them */
    network: LinkStatus | null;
    /** Whether a GM's panel is connected */
    gm: boolean;
}

export interface Remote {
    status(): RemoteStatus;
    subscribe(listener: () => void): () => void;
    stop(): void;
}

/** A program's pairing code on this device: the same each time, so a panel stays paired. */
function codeFor(program: string): string {
    const key = `teletronix:remote-code:${program}`;
    try {
        const saved = localStorage.getItem(key);
        if (saved) return saved;
        const code = newCode();
        localStorage.setItem(key, code);
        return code;
    } catch {
        return newCode();
    }
}

/**
 * Lets a GM's panel control the terminal: from another window of this browser, and with
 * `network`, from other devices by a pairing code. It carries out the panel's commands, and
 * tells the panel what's on screen.
 */
export function followRemote(
    terminal: Terminal,
    program: string,
    { network = false }: { network?: boolean } = {},
): Remote {
    const player = crypto.randomUUID();
    const listeners = new Set<() => void>();
    let status: RemoteStatus = {
        code: network ? codeFor(program) : null,
        network: null,
        gm: false,
    };
    const update = (change: Partial<RemoteStatus>) => {
        const next = { ...status, ...change };
        if (next.network === status.network && next.gm === status.gm) return;
        status = next;
        for (const listener of listeners) listener();
    };

    let effects: EffectsSetting | undefined;
    let burst: ReturnType<typeof setTimeout> | undefined;
    let lastGm = 0;
    const seen: string[] = [];

    const links: Link[] = [];
    const report = () => {
        const message: PlayerMessage = { type: "state", player, state: playerState(terminal) };
        for (const link of links) link.send(message);
    };
    let pending = false;
    // (changes come in bunches: report once they've settled)
    const changed = () => {
        if (pending) return;
        pending = true;
        queueMicrotask(() => {
            pending = false;
            report();
        });
    };

    const handle = (received: { type: string }) => {
        const message = received as GmEnvelope;
        if (typeof message.id !== "string") return;
        if (seen.includes(message.id)) return;
        seen.push(message.id);
        if (seen.length > SEEN) seen.shift();
        lastGm = Date.now();
        update({ gm: true });

        switch (message.type) {
            case "hello":
                report();
                break;
            case "ping":
                break;
            case "action": {
                const action = ActionSchema.safeParse(message.action);
                // (a program the panel loaded differently could name something missing)
                if (action.success) {
                    try {
                        terminal.dispatch(action.data);
                    } catch {
                        // nothing happens
                    }
                }
                break;
            }
            case "effects":
                effects = message.effects ?? undefined;
                if (!burst) terminal.setRemoteEffects(effects);
                break;
            case "burst":
                clearTimeout(burst);
                terminal.setRemoteEffects({ ...effects, ...BURST });
                burst = setTimeout(() => {
                    burst = undefined;
                    terminal.setRemoteEffects(effects);
                }, message.ms);
                break;
            case "transmit":
                terminal.transmit(message.text, {
                    ...(message.dismiss ? { dismiss: message.dismiss } : {}),
                    ...(message.alert ? { className: "alert" } : {}),
                });
                break;
            case "close-dialog":
                terminal.answerDialog(false);
                break;
        }
    };

    links.push(channelLink(program, handle));
    if (status.code) {
        links.push(
            relayLink(status.code, "player", handle, (network) => {
                update({ network });
                // tell a panel that's waiting what's on screen
                if (network === "connected") report();
            }),
        );
    }

    const unsubscribe = terminal.subscribe(changed);
    const heartbeat = setInterval(() => {
        report();
        if (Date.now() - lastGm > GONE_MS) update({ gm: false });
    }, HEARTBEAT_MS);
    report();
    return {
        status: () => status,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        stop: () => {
            unsubscribe();
            clearInterval(heartbeat);
            clearTimeout(burst);
            for (const link of links) link.close();
        },
    };
}
