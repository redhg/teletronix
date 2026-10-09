import { useContext, useEffect, useRef, useState } from "react";
import type { ResolvedEffects, View } from "../../engine/index.ts";
import { EffectsLayer } from "../effects.tsx";
import { useSoundToggle, VideoVolumeContext } from "../sound/context.ts";
import { useTerminal, useTerminalSnapshot } from "../terminal-context.ts";
import "../dialog.css";
import "./viewer.css";

/** How long after the mouse (or a key) last moved the BACK button fades. */
const IDLE_MS = 2500;

/** A tape counter: 0:01:23. */
const counter = (seconds: number) => {
    const s = Math.floor(seconds);
    return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * An image or video over the whole window (an action's "view"), on the same glass as the
 * screen: the effects are drawn over it. [ BACK ], Esc, or a video's end close it. A click or
 * Space pauses a video, and plays it again.
 */
export function Viewer({ view, effects }: { view: View; effects: ResolvedEffects }) {
    const terminal = useTerminal();
    const dialog = useRef<HTMLDialogElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const sound = useSoundToggle();
    const volume = useContext(VideoVolumeContext);
    const muted = view.muted || sound?.muted === true;
    const [paused, setPaused] = useState(false);
    const [time, setTime] = useState(0);
    const [idle, setIdle] = useState(false);
    const held = useTerminalSnapshot().paused !== null;

    useEffect(() => {
        dialog.current?.showModal();
    }, []);

    // the BACK button fades when nothing's moved for a while, and comes back with a move
    useEffect(() => {
        let timer = setTimeout(() => setIdle(true), IDLE_MS);
        const wake = () => {
            setIdle(false);
            clearTimeout(timer);
            timer = setTimeout(() => setIdle(true), IDLE_MS);
        };
        window.addEventListener("pointermove", wake);
        window.addEventListener("pointerdown", wake);
        window.addEventListener("keydown", wake);
        return () => {
            clearTimeout(timer);
            window.removeEventListener("pointermove", wake);
            window.removeEventListener("pointerdown", wake);
            window.removeEventListener("keydown", wake);
        };
    }, []);

    // sound as the player has it; a browser that won't play it yet plays it silently
    useEffect(() => {
        const element = video.current;
        if (!element) return;
        element.volume = Math.min(1, Math.max(0, volume));
        element.muted = muted;
        element.play().catch(() => {
            element.muted = true;
            element.play().catch(() => setPaused(true));
        });
    }, [muted, volume]);

    // the GM's pause stops the video too, and starts it again
    useEffect(() => {
        const element = video.current;
        if (!element) return;
        if (held) element.pause();
        else void element.play().catch(() => {});
    }, [held]);

    const togglePause = () => {
        const element = video.current;
        if (!element) return;
        if (element.paused) void element.play().catch(() => {});
        else element.pause();
    };

    return (
        <dialog
            ref={dialog}
            className="viewer"
            aria-label={view.caption ?? (view.kind === "video" ? "Video" : "Image")}
            data-idle={idle || undefined}
            onCancel={(event) => {
                event.preventDefault();
                terminal.closeView();
            }}
            onKeyDown={(event) => {
                if (view.kind !== "video" || event.key !== " ") return;
                if (event.target instanceof HTMLButtonElement) return;
                event.preventDefault();
                togglePause();
            }}
        >
            {view.kind === "video" ? (
                // biome-ignore lint/a11y/useMediaCaption: a program's own clips have no captions to give
                <video
                    ref={video}
                    className="viewer-media"
                    style={{ objectFit: view.fit }}
                    src={view.src}
                    autoPlay
                    playsInline
                    loop={view.loop}
                    onClick={togglePause}
                    onPlay={() => setPaused(false)}
                    onPause={() => setPaused(true)}
                    onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
                    onEnded={() => terminal.viewEnded()}
                />
            ) : (
                <img
                    className="viewer-media"
                    style={{ objectFit: view.fit }}
                    src={view.src}
                    alt={view.caption ?? ""}
                />
            )}
            {view.osd && view.kind === "video" && (
                <div className="viewer-osd" aria-hidden="true">
                    <span>{paused ? "PAUSE ‖" : "PLAY ►"}</span>
                    <span>{counter(time)}</span>
                </div>
            )}
            {view.caption && <div className="viewer-caption">{view.caption}</div>}
            <EffectsLayer effects={effects} />
            <button
                type="button"
                className="viewer-back dialog-button"
                // biome-ignore lint/a11y/noAutofocus: the dialog's one control, for the keyboard
                autoFocus
                onClick={() => terminal.closeView()}
            >
                BACK
            </button>
        </dialog>
    );
}
