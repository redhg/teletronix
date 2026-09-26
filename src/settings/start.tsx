import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { parseProgram } from "../engine/index.ts";
import { fetchProgramJson } from "../ui/load-program.ts";
import { SettingsApp } from "./SettingsApp.tsx";
import "./settings.css";

/** The appearance settings for `?data=<name>`: a panel beside a live preview. */
export async function startSettings(root: Root, params: URLSearchParams): Promise<void> {
    const name = params.get("data") ?? "sample";
    const file = await fetchProgramJson(name);
    const result = file.ok ? parseProgram(file.json) : file;

    if (!file.ok || !result.ok) {
        const { title, errors } = !file.ok
            ? file
            : { title: `${file.url} is invalid`, errors: result.ok ? [] : result.errors };
        root.render(
            <main className="settings-error">
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

    document.title = `${result.program.config.name}: appearance`;
    root.render(
        <StrictMode>
            <SettingsApp name={name} file={file.json as ProgramFile} program={result.program} />
        </StrictMode>,
    );
}

/** A program file as written: only the parts the settings page touches are typed. */
export interface ProgramFile {
    config: Record<string, unknown>;
    [key: string]: unknown;
}
