import { createContext, useContext } from "react";
import type { SoundCue } from "./synth.ts";

/** Lets views make sounds (select, tick, a glitch…). Silent when there's no sound. */
export const SoundContext = createContext<(cue: SoundCue) => void>(() => {});

export const useSound = () => useContext(SoundContext);

/** The sound toggle's state, for a toggle in a bar. Null when the program has no sound. */
export interface SoundToggle {
    muted: boolean;
    /** [♪] or [♪×] */
    label: string;
    toggle: () => void;
}

export const SoundToggleContext = createContext<SoundToggle | null>(null);

export const useSoundToggle = () => useContext(SoundToggleContext);
