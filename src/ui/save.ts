import type { Terminal } from "../engine/index.ts";

/** Where a program's progress is kept: by its name, so each program has its own. */
const keyFor = (terminal: Terminal) => `teletronix:save:${terminal.program.config.name}`;

/**
 * For a program that saves (config.save): carries on from its saved progress, then keeps
 * saving as it changes (and as the page goes). Returns a function that stops saving.
 */
export function keepSaved(terminal: Terminal): () => void {
    if (!terminal.program.save) return () => {};
    const key = keyFor(terminal);
    try {
        const saved = localStorage.getItem(key);
        if (saved) terminal.restoreState(JSON.parse(saved));
    } catch {
        // (storage that's blocked, or a save that's not valid JSON: start afresh)
    }

    const save = () => {
        try {
            localStorage.setItem(key, JSON.stringify(terminal.saveState()));
        } catch {
            // (full or blocked storage: carry on without saving)
        }
    };
    // not on every change: a moment after the last one
    let timer = 0;
    const later = () => {
        clearTimeout(timer);
        timer = window.setTimeout(save, 300);
    };
    const unsubscribe = terminal.subscribe(later);
    const interval = window.setInterval(save, 5000);
    window.addEventListener("pagehide", save);
    return () => {
        clearTimeout(timer);
        clearInterval(interval);
        unsubscribe();
        window.removeEventListener("pagehide", save);
    };
}
