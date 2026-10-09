import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { barsOf, hasSoundToggle, type ResolvedSound, type Terminal } from "../../engine/index.ts";
import { useOpensSettings } from "../settings/context.ts";
import { useTerminalSnapshot } from "../terminal-context.ts";
import { SoundContext, type SoundToggle, SoundToggleContext } from "./context.ts";
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

/** The toggle's label: a note, crossed out while muted. */
export const toggleLabel = (muted: boolean) => (muted ? "[♪×]" : "[♪]");

/**
 * Plays the program's sounds, and shows the toggle that mutes them: in the corner of the
 * screen, unless a bar has one or the program turns it off.
 */
export function SoundLayer({ terminal, sound, children }: Props) {
    const [synth] = useState(() => new Synth());
    const [muted, setMuted] = useState(readMuted);

    useEffect(() => synth.configure(sound, muted), [synth, sound, muted]);
    // (the ambience and the hum go on until the audio is let go)
    useEffect(() => () => synth.close(), [synth]);

    useEffect(() => {
        const unlock = () => synth.unlock();
        for (const type of GESTURES) window.addEventListener(type, unlock, { capture: true });
        return () => {
            for (const type of GESTURES)
                window.removeEventListener(type, unlock, { capture: true });
        };
    }, [synth]);

    useEffect(() => {
        synth.setLibrary(terminal.program.sounds);
        synth.setFiles(terminal.program.audio);
    }, [synth, terminal]);
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

    // (a long press, or a right-click, opens the quick settings)
    const press = useOpensSettings(toggle);

    const toggleState = useMemo<SoundToggle | null>(
        () => (sound ? { muted, label: toggleLabel(muted), toggle } : null),
        [sound, muted, toggle],
    );
    // (a bar with the toggle in it stands in for the one in the corner)
    const current = useTerminalSnapshot().screen?.run.screen;
    const { header, footer } = barsOf(terminal.program, current);
    const inBar = hasSoundToggle(header) || hasSoundToggle(footer);

    return (
        <SoundContext value={play}>
            <SoundToggleContext value={toggleState}>
                {children}
                <StaticHiss synth={synth} />
                <Ambience synth={synth} />
                {sound?.button && !inBar && (
                    <button
                        type="button"
                        className="sound-toggle"
                        aria-label="Sound"
                        aria-pressed={!muted}
                        title={`Sound ${muted ? "off" : "on"} (Ctrl+M)`}
                        {...press}
                    >
                        {toggleLabel(muted)}
                    </button>
                )}
            </SoundToggleContext>
        </SoundContext>
    );
}

/** A steady hiss while the static effect is on, as loud as the static is strong. */
function StaticHiss({ synth }: { synth: Synth }) {
    const level = useTerminalSnapshot().effects.static?.opacity ?? 0;
    useEffect(() => synth.setHiss(level), [synth, level]);
    return null;
}

/**
 * The audio file looping in the background, as the screen (or a GM) says: quiet while a
 * video with its sound plays.
 */
function Ambience({ synth }: { synth: Synth }) {
    const { ambience, view, paused } = useTerminalSnapshot();
    const video = view?.kind === "video" && !view.muted;
    // paused, the cover's own sound, or silence
    const playing = paused ? (paused.sound ?? null) : video ? null : ambience;
    useEffect(() => synth.setAmbience(playing), [synth, playing]);
    return null;
}
