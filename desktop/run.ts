import { spawn } from "node:child_process";
import { createRequire } from "node:module";

// Starts the desktop app from the repository (`npm run desktop`), after a build. Electron runs
// as plain Node when ELECTRON_RUN_AS_NODE is set (as some editors' terminals set it), so it's
// started without it. Arguments go through: `npm run desktop -- --kiosk`.

const electron = createRequire(import.meta.url)("electron") as unknown as string;
const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
const child = spawn(electron, [".", ...process.argv.slice(2)], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
