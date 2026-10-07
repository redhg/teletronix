import { createContext, type PointerEvent, useContext, useRef } from "react";

/** Opens the player's quick settings, or null where there are none (see config.playerSettings). */
export const SettingsContext = createContext<(() => void) | null>(null);

/** How long a press opens the settings, rather than being a click. */
const LONG_PRESS_MS = 600;

/**
 * Handlers for the sound toggle: a long press (or a right-click) opens the quick settings;
 * the click that ends a long press doesn't also toggle the sound.
 */
export function useOpensSettings(onClick: () => void) {
    const open = useContext(SettingsContext);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const opened = useRef(false);
    const cancel = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
    };
    if (!open) return { onClick };
    return {
        onClick: () => {
            if (opened.current) opened.current = false;
            else onClick();
        },
        onPointerDown: (event: PointerEvent) => {
            if (event.button !== 0) return;
            opened.current = false;
            cancel();
            timer.current = setTimeout(() => {
                opened.current = true;
                open();
            }, LONG_PRESS_MS);
        },
        onPointerUp: cancel,
        onPointerLeave: cancel,
        onContextMenu: (event: { preventDefault: () => void }) => {
            event.preventDefault();
            cancel();
            open();
        },
    };
}
