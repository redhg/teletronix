import { createContext, useContext } from "react";

/** The names in the program that a form offers to choose from. */
export interface ProgramNames {
    screens: { id: string; title?: string }[];
    dialogs: string[];
    sounds: string[];
}

export const ProgramNamesContext = createContext<ProgramNames>({
    screens: [],
    dialogs: [],
    sounds: [],
});

/** The program's screens, dialogs and sounds, by name. */
export const useProgramNames = () => useContext(ProgramNamesContext);
