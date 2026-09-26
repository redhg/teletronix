import type { ParseError } from "../engine/index.ts";
import "./terminal.css";

interface Props {
    title: string;
    errors: ParseError[];
}

/** Shown instead of the terminal when a program can't be loaded. */
export function ErrorView({ title, errors }: Props) {
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
        </main>
    );
}
