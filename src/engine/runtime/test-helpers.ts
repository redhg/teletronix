import { parseProgram, type TeletronixFile } from "../schema/program.ts";
import { ManualTicker } from "../time/ticker.ts";
import { Terminal, type TerminalOptions } from "./terminal.ts";

/** A terminal for a program, driven by a manual ticker. */
export function createTestTerminal(
    file: TeletronixFile,
    options: Partial<Omit<TerminalOptions, "program" | "ticker">> = {},
) {
    const result = parseProgram(file);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const ticker = new ManualTicker();
    const terminal = new Terminal({ program: result.program, ticker, ...options });
    return { terminal, ticker, program: result.program };
}

/** A promise with its resolve and reject functions exposed. */
export function deferred() {
    let resolve!: () => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/** Lets pending promise callbacks run. */
export async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}
