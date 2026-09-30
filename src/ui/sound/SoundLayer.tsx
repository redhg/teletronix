import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { ResolvedSound, Terminal } from "../../engine/index.ts";
import { useTerminalSnapshot } from "../terminal-context.ts";
import { SoundContext } from "./context.ts";
import { type SoundCue, Synth } from "./synth.ts";
import "./sound.css";

const MUTED_KEY = "teletronix:muted";

// the player's mute choice outlives the page; storage can be unavailable (private modes)
const readMuted = () => {
    try {
        return localStorage.getItem(MUTED_KEY) === "true";
    } catch {
        return false;
    }
};
const writeMuted = (muted: boolean) => {
    try {
        localStorage.setItem(MUTED_KEY, String(muted));
    } catch {
        // not remembered, but still applied
    }
};

// Browsers let audio start only from these (for touch, the end of the touch counts)
const GESTURES = ["pointerdown", "pointerup", "click", "keydown"] as const;

interface Props {
    terminal: Terminal;
    sound: ResolvedSound | null;
    children: ReactNode;
}

/** Plays the program's sounds, and shows the toggle that mutes them. */
export function SoundLayer({ terminal, sound, children }: Props) {
    const [synth] = useState(() => new Synth());
    const [muted, setMuted] = useState(readMuted);

    useEffect(() => synth.configure(sound, muted), [synth, sound, muted]);

    useEffect(() => {
        const unlock = () => synth.unlock();
        for (const type of GESTURES) window.addEventListener(type, unlock, { capture: true });
        return () => {
            for (const type of GESTURES)
                window.removeEventListener(type, unlock, { capture: true });
        };
    }, [synth]);

    useEffect(() => synth.setLibrary(terminal.program.sounds), [synth, terminal]);
    useEffect(() => terminal.subscribeCues((cue) => synth.play(cue)), [terminal, synth]);

    const play = useCallback((cue: SoundCue) => synth.play(cue), [synth]);

    const toggle = useCallback(() => {
        synth.unlock();
        setMuted((was) => {
            writeMuted(!was);
            return !was;
        });
    }, [synth]);

    // Ctrl+M mutes or unmutes from anywhere (not Cmd+M: that minimizes the window on a Mac)
    useEffect(() => {
        if (!sound) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            const plainCtrl = event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
            if (!plainCtrl || event.key.toLowerCase() !== "m" || event.repeat) return;
            event.preventDefault();
            toggle();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [sound, toggle]);

    return (
        <SoundContext value={play}>
            {children}
            <StaticHiss synth={synth} />
            {sound && (
                <button
                    type="button"
                    className="sound-toggle"
                    aria-pressed={!muted}
                    onClick={toggle}
                >
                    {muted ? "[SOUND OFF]" : "[SOUND ON]"}
                </button>
            )}
        </SoundContext>
    );
}

/** A steady hiss while the static effect is on, as loud as the static is strong. */
function StaticHiss({ synth }: { synth: Synth }) {
    const level = useTerminalSnapshot().effects.static?.opacity ?? 0;
    useEffect(() => synth.setHiss(level), [synth, level]);
    return null;
}
