import { ActionSchema, type EffectsSetting, type Terminal } from "../engine/index.ts";
import {
    channelName,
    type GmMessage,
    isMessage,
    type PlayerMessage,
    type PlayerState,
} from "./protocol.ts";

/** How often a players' window reports in, so the panel knows it's still there. */
export const HEARTBEAT_MS = 1000;
/** How heavy a GM's burst of static is. */
const BURST = { static: { opacity: 0.7 } } satisfies EffectsSetting;

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

/**
 * Lets a GM's panel in another window of this browser control the terminal: it carries out
 * the panel's commands, and tells the panel what's on screen. Returns a function that stops.
 */
export function followRemote(terminal: Terminal, program: string): () => void {
    const channel = new BroadcastChannel(channelName(program));
    const player = crypto.randomUUID();
    let effects: EffectsSetting | undefined;
    let burst: ReturnType<typeof setTimeout> | undefined;

    let pending = false;
    const report = () => {
        pending = false;
        const message: PlayerMessage = { type: "state", player, state: playerState(terminal) };
        channel.postMessage(message);
    };
    // (changes come in bunches: report once they've settled)
    const changed = () => {
        if (pending) return;
        pending = true;
        queueMicrotask(report);
    };

    const handle = (message: GmMessage) => {
        switch (message.type) {
            case "hello":
                report();
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
    channel.onmessage = (event: MessageEvent) => {
        if (isMessage(event.data)) handle(event.data as GmMessage);
    };

    const unsubscribe = terminal.subscribe(changed);
    const heartbeat = setInterval(report, HEARTBEAT_MS);
    report();
    return () => {
        unsubscribe();
        clearInterval(heartbeat);
        clearTimeout(burst);
        channel.close();
    };
}
