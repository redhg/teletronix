import { localStorageColorSchemeManager, MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { DEFAULT_THEME, resolveTheme, type ThemeSetting } from "../engine/index.ts";
import { toolTheme } from "../mantine/theme.ts";
import { fetchProgramJson } from "../ui/load-program.ts";
import { EditorApp, NEW_PROGRAM, type ProgramFile } from "./EditorApp.tsx";
import "@mantine/core/styles.css";

/** The editor's light, dark or automatic colour scheme, kept between visits (with the GM's). */
const colorSchemes = localStorageColorSchemeManager({ key: "teletronix:tool-color-scheme" });

/**
 * The editor, for `?edit&data=<name>`: it opens public/data/<name>.json, or starts a new
 * program of that name if there isn't one.
 */
export async function startEditor(root: Root, params: URLSearchParams): Promise<void> {
    const name = params.get("data") ?? "sample";
    const [loaded, canSave] = await Promise.all([fetchProgramJson(name), saveAvailable()]);
    const file: ProgramFile = loaded.ok ? (loaded.json as ProgramFile) : NEW_PROGRAM;
    const theme = (file.config as { theme?: ThemeSetting } | undefined)?.theme ?? DEFAULT_THEME;

    root.render(
        <StrictMode>
            <MantineProvider
                theme={toolTheme(resolveTheme(theme).fg)}
                defaultColorScheme="auto"
                colorSchemeManager={colorSchemes}
            >
                <EditorApp
                    name={name}
                    file={file}
                    canSave={canSave}
                    notice={loaded.ok ? undefined : `No ${name}.json yet: this is a new program`}
                />
            </MantineProvider>
        </StrictMode>,
    );
}

/** Whether Save can write into public/data here: only the dev server has the endpoint. */
async function saveAvailable(): Promise<boolean> {
    try {
        const response = await fetch(new URL("__teletronix/save", location.href));
        return response.status === 204;
    } catch {
        return false;
    }
}
