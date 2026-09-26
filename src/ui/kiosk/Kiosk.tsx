import { useEffect } from "react";
import type { Terminal } from "../../engine/index.ts";
import "./kiosk.css";

/** How long the mouse pointer stays visible after it last moved. */
export const CURSOR_TIMEOUT_MS = 3000;

/** Goes full screen, if the browser can and isn't already. Only works during a gesture. */
function enterFullscreen(): void {
    const root = document.documentElement;
    if (document.fullscreenElement || !root.requestFullscreen) return;
    root.requestFullscreen({ navigationUI: "hide" }).catch(() => {
        // refused (e.g. not allowed in a frame); the program runs in the window instead
    });
}

/**
 * The first thing a kiosk shows: browsers only allow full screen (and sound) after a key
 * press or tap, so it waits for one before the program starts.
 */
export function KioskGate({ title, onStart }: { title: string; onStart: () => void }) {
    useEffect(() => {
        const start = (event: Event) => {
            if (event instanceof KeyboardEvent && isModifier(event.key)) return;
            event.preventDefault();
            enterFullscreen();
            onStart();
        };
        window.addEventListener("keydown", start);
        window.addEventListener("pointerdown", start);
        return () => {
            window.removeEventListener("keydown", start);
            window.removeEventListener("pointerdown", start);
        };
    }, [onStart]);

    return (
        <main className="terminal kiosk-gate">
            <p>{title}</p>
            <p className="kiosk-prompt">PRESS ANY KEY</p>
        </main>
    );
}

const isModifier = (key: string) => ["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(key);

/**
 * What a kiosk does while the program runs: stays full screen and awake, hides the idle
 * pointer, keeps the page from being zoomed, selected or left by accident, and restarts the
 * program on Ctrl+Alt+R.
 */
export function useKiosk(terminal: Terminal, on: boolean): void {
    useEffect(() => {
        if (!on) return;
        const root = document.documentElement;
        root.dataset.kiosk = "";
        const cleanups: (() => void)[] = [() => delete root.dataset.kiosk];
        const listen = <K extends keyof WindowEventMap>(
            type: K,
            listener: (event: WindowEventMap[K]) => void,
            options?: AddEventListenerOptions,
        ) => {
            window.addEventListener(type, listener, options);
            cleanups.push(() => window.removeEventListener(type, listener, options));
        };

        // back to full screen at the next gesture, if the player left it (e.g. with Esc)
        listen("pointerdown", enterFullscreen);
        listen("keydown", (event) => {
            if (event.ctrlKey && event.altKey && event.code === "KeyR") {
                event.preventDefault();
                terminal.restart();
                return;
            }
            // browser zoom: Ctrl/Cmd with + - 0
            if ((event.ctrlKey || event.metaKey) && ["=", "+", "-", "0"].includes(event.key)) {
                event.preventDefault();
                return;
            }
            if (event.key !== "Escape") enterFullscreen();
        });

        // zooming with a trackpad or wheel, and pinching in Safari
        listen("wheel", (event) => event.ctrlKey && event.preventDefault(), { passive: false });
        const gesture = (event: Event) => event.preventDefault();
        document.addEventListener("gesturestart", gesture);
        cleanups.push(() => document.removeEventListener("gesturestart", gesture));

        // ask before leaving the page
        listen("beforeunload", (event) => event.preventDefault());

        // the pointer disappears when it's still
        let timer: ReturnType<typeof setTimeout> | undefined;
        const showPointer = () => {
            delete root.dataset.cursorHidden;
            clearTimeout(timer);
            timer = setTimeout(() => {
                root.dataset.cursorHidden = "";
            }, CURSOR_TIMEOUT_MS);
        };
        showPointer();
        listen("pointermove", showPointer);
        cleanups.push(() => {
            clearTimeout(timer);
            delete root.dataset.cursorHidden;
        });

        // keep the screen on; the lock is dropped whenever the page is hidden, so take it again
        let lock: WakeLockSentinel | null = null;
        let active = true;
        const wake = () => {
            if (document.visibilityState !== "visible" || !navigator.wakeLock) return;
            navigator.wakeLock.request("screen").then(
                (sentinel) => {
                    if (active) lock = sentinel;
                    else sentinel.release();
                },
                () => {
                    // not allowed (e.g. low battery); the screen may sleep
                },
            );
        };
        wake();
        document.addEventListener("visibilitychange", wake);
        cleanups.push(() => {
            active = false;
            document.removeEventListener("visibilitychange", wake);
            lock?.release();
        });

        return () => {
            for (const cleanup of cleanups) cleanup();
        };
    }, [terminal, on]);
}
