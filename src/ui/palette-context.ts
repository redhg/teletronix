import { createContext } from "react";
import { type Palette, resolveTheme } from "../engine/index.ts";

/** The program's current colors, for views that draw with them (e.g. blended bitmaps). */
export const PaletteContext = createContext<Palette>(resolveTheme(undefined));
