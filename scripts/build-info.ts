import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Which build this is: what `teletronix.version` and `?version` show (see src/version.ts). */
export interface BuildInfo {
    /** package.json's version, e.g. "0.2.0" */
    version: string;
    /** The commit it's built from, e.g. "ca1cc87" ("unknown" outside a git checkout) */
    commit: string;
    /** When it was built, e.g. "2026-10-10T15:38:02Z" */
    built: string;
}

/** This build's version, commit and time. */
export function buildInfo(root: URL): BuildInfo {
    const { version } = JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as {
        version: string;
    };
    let commit = process.env.GITHUB_SHA?.slice(0, 7) ?? "";
    if (!commit) {
        try {
            commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
                cwd: root,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim();
        } catch {
            commit = "unknown";
        }
    }
    return { version, commit, built: new Date().toISOString().replace(/\.\d+Z$/, "Z") };
}
