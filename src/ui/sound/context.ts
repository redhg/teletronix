import { createContext, useContext } from "react";
import type { SoundCue } from "./synth.ts";

/** Lets views make sounds (select, tick, a glitch…). Silent when there's no sound. */
export const SoundContext = createContext<(cue: SoundCue) => void>(() => {});

export const useSound = () => useContext(SoundContext);
