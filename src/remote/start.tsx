import { localStorageColorSchemeManager, MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { parseProgram } from "../engine/index.ts";
import { toolTheme } from "../mantine/theme.ts";
import { fetchProgramJson } from "../ui/load-program.ts";
import { GmApp } from "./GmApp.tsx";
import "@mantine/core/styles.css";
import "./gm.css";

/** The panel's light, dark or automatic colour scheme, kept between visits (with the editor's). */
const colorSchemes = localStorageColorSchemeManager({ key: "teletronix:tool-color-scheme" });

/** A GM's control panel for `?data=<name>`, played in another window of this browser. */
export async function startGm(root: Root, params: URLSearchParams): Promise<void> {
    const name = params.get("data") ?? "sample";
    const file = await fetchProgramJson(name);
    const result = file.ok ? parseProgram(file.json) : file;
    if (!file.ok || !result.ok) {
        const { title, errors } = !file.ok
            ? file
            : { title: `${file.url} is invalid`, errors: result.ok ? [] : result.errors };
        root.render(
            <main className="gm-error">
                <h1>{title}</h1>
                <ul>
                    {errors.map((error) => (
                        <li key={`${error.path}:${error.message}`}>
                            {error.path && <code>{error.path}: </code>}
                            {error.message}
                        </li>
                    ))}
                </ul>
            </main>,
        );
        return;
    }

    document.title = `${result.program.config.name}: GM`;
    root.render(
        <StrictMode>
            <MantineProvider
                theme={toolTheme(result.program.palette.fg)}
                defaultColorScheme="auto"
                colorSchemeManager={colorSchemes}
            >
                <GmApp name={name} program={result.program} />
            </MantineProvider>
        </StrictMode>,
    );
}
