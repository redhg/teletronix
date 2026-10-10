import type { ParseError } from "../engine/index.ts";
import "./terminal.css";

interface Props {
    title: string;
    errors: ParseError[];
    /** Something to do about it, e.g. choosing a package that isn't here */
    action?: { label: string; run: () => void };
}

/** Shown instead of the terminal when a program can't be loaded. */
export function ErrorView({ title, errors, action }: Props) {
    return (
        <main className="terminal error-view">
            <h1 className="alert">{title}</h1>
            <ul>
                {errors.map((error) => (
                    <li key={`${error.path}:${error.message}`}>
                        {error.path && <code>{error.path}: </code>}
                        {error.message}
                    </li>
                ))}
            </ul>
            {action && (
                <button type="button" className="error-action" onClick={action.run}>
                    {action.label}
                </button>
            )}
        </main>
    );
}
