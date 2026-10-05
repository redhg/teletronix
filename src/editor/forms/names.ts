import { createContext, useContext } from "react";

/** The names in the program that a form offers to choose from. */
export interface ProgramNames {
    screens: { id: string; title?: string }[];
    dialogs: string[];
    sounds: string[];
    /** The sounds that are audio files, which can loop as ambience */
    audio: string[];
}

export const ProgramNamesContext = createContext<ProgramNames>({
    screens: [],
    dialogs: [],
    sounds: [],
    audio: [],
});

/** The program's screens, dialogs and sounds, by name. */
export const useProgramNames = () => useContext(ProgramNamesContext);
