import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { parseProgram } from "../engine/index.ts";
import { fetchProgramJson } from "../ui/load-program.ts";
import { GmApp } from "./GmApp.tsx";
import "./gm.css";

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
            <GmApp name={name} program={result.program} />
        </StrictMode>,
    );
}
