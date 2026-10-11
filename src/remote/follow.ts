import {
    ActionSchema,
    type Cue,
    type EffectsSetting,
    type Terminal,
    ViewSchema,
} from "../engine/index.ts";
import { withFiles } from "../package/format.ts";
import { cleanJoinCode } from "./codes.ts";
import { channelLink, type Link, type LinkStatus, randomId, sessionLink } from "./link.ts";
import type { BuiltinSound, GmEnvelope, PlayerMessage, PlayerState } from "./protocol.ts";
import type { Refusal } from "./relay-protocol.ts";

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
        ambience: snapshot.ambience,
        view: snapshot.view?.src ?? null,
        paused: snapshot.paused !== null,
    };
}

/** How a terminal's remote control is doing, for its badge (and its join prompt). */
export interface RemoteStatus {
    /** The session it's joined, by its join code ("BCDF-1234") */
    code: string | null;
    /** Whether it's to join one, and has no code yet: it asks for one */
    asking: boolean;
    /** Its link to the session */
    network: LinkStatus | null;
    /** Why the relay wouldn't have it, if it wouldn't */
    refused: Refusal | null;
    /** Whether a GM's panel is connected */
    gm: boolean;
}

export interface Remote {
    status(): RemoteStatus;
    subscribe(listener: () => void): () => void;
    /** Joins a session by its code, as typed (false if it isn't one). */
    join(code: string): boolean;
    /** Stops asking for a code: plays on without joining. */
    dismiss(): void;
    stop(): void;
}

/**
 * This window's id, the same after a reload (kept for the tab: another tab is another
 * window), so the GM's panel knows it again: its name there, and messages for it alone.
 */
function windowId(program: string): string {
    const key = `teletronix:window:${program}`;
    try {
        const kept = sessionStorage.getItem(key);
        if (kept) return kept;
        const id = randomId();
        sessionStorage.setItem(key, id);
        return id;
    } catch {
        return randomId();
    }
}

/** The session a program joined on this device, kept so it joins again after a reload. */
const joinKey = (program: string) => `teletronix:join-code:${program}`;

export function savedJoinCode(program: string): string | null {
    try {
        return cleanJoinCode(localStorage.getItem(joinKey(program)) ?? "");
    } catch {
        return null;
    }
}

export function rememberJoinCode(program: string, code: string | null) {
    try {
        if (code) localStorage.setItem(joinKey(program), code);
        else localStorage.removeItem(joinKey(program));
    } catch {
        // not remembered
    }
}

/**
 * Lets a GM's panel control the terminal: from another window of this browser, and with
 * `join`, from other devices, as a player in the GM's session (by its join code: one given,
 * the one it joined last time, or one it asks for). It carries out the panel's commands, and
 * tells the panel what's on screen.
 */
export function followRemote(
    terminal: Terminal,
    program: string,
    {
        join = false,
        code,
        files,
    }: {
        /** Whether to join a GM's session over the network */
        join?: boolean;
        /** Its join code, as given (e.g. in a QR code's address), if one was */
        code?: string;
        /**
         * For a package's program: where its files are here ("data/…" to an address in this
         * window), as the panel names them by their "data/…" paths
         */
        files?: Map<string, string>;
    } = {},
): Remote {
    const player = windowId(program);
    // a package's files: from the panel's names to here, and back
    const here = (value: unknown) => (files ? withFiles(value, files) : value);
    const fileNames = new Map([...(files ?? [])].map(([name, address]) => [address, name]));
    const listeners = new Set<() => void>();
    const given = code ? cleanJoinCode(code) : null;
    if (join && given) rememberJoinCode(program, given);
    const startCode = join ? (given ?? savedJoinCode(program)) : null;
    let status: RemoteStatus = {
        code: startCode,
        asking: join && !startCode,
        network: null,
        refused: null,
        gm: false,
    };
    const update = (change: Partial<RemoteStatus>) => {
        const next = { ...status, ...change };
        if (
            (Object.keys(next) as (keyof RemoteStatus)[]).every((key) => next[key] === status[key])
        ) {
            return;
        }
        status = next;
        for (const listener of listeners) listener();
    };

    let effects: EffectsSetting | undefined;
    let burst: ReturnType<typeof setTimeout> | undefined;
    let lastGm = 0;
    /** Whether the relay says the GM's panel is in the session */
    let gmInSession = false;
    const seen: string[] = [];

    const links: Link[] = [];
    /** What each link last said, so a session's relay isn't sent the same state again */
    const lastSaid = new WeakMap<Link, string>();
    /**
     * Tells the panel what's on screen: through every link, or only some. A session's relay
     * only gets it when it's changed (the terminal says it's changed for more than the panel
     * sees: animations, an element's memory), unless it's `forced` (the panel asked).
     */
    const report = (to: Link[] = links, forced = false) => {
        const state = playerState(terminal);
        // (what's showing, by the name the panel knows it by)
        if (state.view && fileNames.has(state.view)) state.view = fileNames.get(state.view) ?? null;
        const message: PlayerMessage = { type: "state", player, state };
        const said = JSON.stringify(state);
        for (const link of to) {
            if (link !== channel && !forced && lastSaid.get(link) === said) continue;
            lastSaid.set(link, said);
            link.send(message);
        }
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
        // (for one window, and not this one: another player's)
        if (message.to !== undefined && message.to !== player) return;
        seen.push(message.id);
        if (seen.length > SEEN) seen.shift();
        lastGm = Date.now();
        update({ gm: true });

        switch (message.type) {
            case "hello":
                report(links, true);
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
            case "view": {
                const view = ViewSchema.safeParse(here(message.view));
                if (view.success) terminal.openView(view.data);
                break;
            }
            case "close-view":
                terminal.closeView();
                break;
            case "play":
                if (message.sound) terminal.play({ type: "sound", name: message.sound });
                else if (message.src) {
                    terminal.play({ type: "file", src: here(message.src) as string });
                } else if (message.builtin) terminal.play(builtinCue(message.builtin));
                break;
            case "stop-media":
                terminal.closeView();
                terminal.play({ type: "stop" });
                break;
            case "pause":
                terminal.pause({
                    ...(message.message ? { message: message.message } : {}),
                    ...(message.image ? { image: here(message.image) as string } : {}),
                    // (only an audio file of the program's loops)
                    ...(message.sound && terminal.program.audio.has(message.sound)
                        ? { sound: message.sound }
                        : {}),
                });
                break;
            case "resume":
                terminal.resume();
                break;
            case "ambience":
                terminal.setRemoteAmbience(message.ambience ?? undefined);
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

    const channel = channelLink(program, handle);
    links.push(channel);
    let session: Link | null = null;
    const joinSession = (joinCode: string) => {
        session?.close();
        if (session) links.splice(links.indexOf(session), 1);
        session = sessionLink(
            { player: { code: joinCode, id: player } },
            handle,
            (network) => {
                update({ network });
                // tell a panel that's waiting what's on screen
                if (network === "connected") report(links, true);
            },
            {
                gm: (present) => {
                    gmInSession = present;
                    if (!present) lastGm = 0;
                    update({ gm: present });
                },
                refused: (reason) => {
                    // (removed by the GM, or a code that won't do: it asks again)
                    gmInSession = false;
                    rememberJoinCode(program, null);
                    update({ refused: reason, gm: false, asking: true, code: null });
                },
            },
        );
        links.push(session);
    };
    if (status.code) joinSession(status.code);

    const unsubscribe = terminal.subscribe(changed);
    // Every so often, through the channel: windows of this browser know each other's there by
    // it. A session's relay says who's there itself, so it only carries changes (it can then
    // sleep between them, on a host that charges for the time it's awake).
    const heartbeat = setInterval(() => {
        report([channel]);
        if (Date.now() - lastGm > GONE_MS) update({ gm: gmInSession });
    }, HEARTBEAT_MS);
    report(links, true);
    return {
        status: () => status,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        join: (typed) => {
            const joinCode = cleanJoinCode(typed);
            if (!joinCode) return false;
            rememberJoinCode(program, joinCode);
            update({ code: joinCode, asking: false, refused: null, network: null });
            joinSession(joinCode);
            return true;
        },
        dismiss: () => update({ asking: false }),
        stop: () => {
            unsubscribe();
            clearInterval(heartbeat);
            clearTimeout(burst);
            for (const link of links) link.close();
        },
    };
}

/** The cue for one of Teletronix's own sounds. */
function builtinCue(sound: BuiltinSound): Cue {
    switch (sound) {
        case "alert":
            return { type: "dialog", alert: true };
        case "beep":
            return { type: "dialog", alert: false };
        case "select":
            return { type: "select" };
        case "glitch":
            return { type: "glitch", duration: 1000 };
        case "static":
            return { type: "static", duration: 1500 };
    }
}
