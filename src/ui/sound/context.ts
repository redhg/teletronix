import { createContext, useContext } from "react";
import type { InterfaceCue } from "./synth.ts";

/** Lets views make interface sounds (select, tick…). Silent when there's no sound. */
export const SoundContext = createContext<(cue: InterfaceCue) => void>(() => {});

export const useSound = () => useContext(SoundContext);
