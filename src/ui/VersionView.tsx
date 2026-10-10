import { useEffect, useState } from "react";
import { useWaitingUpdate } from "../remote/update.ts";
import { BUILD, type BuildInfo, describeBuild, sameBuild } from "../version.ts";
import "./terminal.css";

/** What the server has now: its build, or why it couldn't say. */
type Online = { build: BuildInfo } | { error: string } | null;

/** The build deployed now, read past every cache (it's left out of the offline one, too). */
async function onlineBuild(): Promise<Online> {
    try {
        const response = await fetch(`version.json?${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return { error: `the server answered ${response.status}` };
        return { build: (await response.json()) as BuildInfo };
    } catch {
        return { error: "the server didn't answer (offline?)" };
    }
}

/**
 * `?version`: which Teletronix this browser is running, and whether it's the one online now,
 * or an older copy from the offline cache (with the newer one waiting, if it's downloaded).
 */
export function VersionView() {
    const [online, setOnline] = useState<Online>(null);
    const update = useWaitingUpdate();
    useEffect(() => {
        void onlineBuild().then(setOnline);
    }, []);

    const verdict =
        online === null
            ? "CHECKING…"
            : "error" in online
              ? `COULDN'T CHECK: ${online.error}.`
              : sameBuild(BUILD, online.build)
                ? "UP TO DATE."
                : update
                  ? "OUT OF DATE: the newer one is downloaded, and waiting."
                  : "OUT OF DATE: close every Teletronix tab and window, then open it again.";
    const current = online !== null && "build" in online && sameBuild(BUILD, online.build);

    return (
        <main className="terminal version-view">
            <h1>TELETRONIX VERSION</h1>
            <dl>
                <dt>THIS BROWSER</dt>
                <dd>{describeBuild(BUILD)}</dd>
                <dt>ONLINE NOW</dt>
                <dd>
                    {online === null
                        ? "…"
                        : "build" in online
                          ? describeBuild(online.build)
                          : "UNKNOWN"}
                </dd>
            </dl>
            <p className={current ? undefined : "alert"} role="status">
                {verdict}
            </p>
            <nav className="version-actions">
                {update && (
                    <button type="button" onClick={update}>
                        &gt; SWITCH TO IT NOW
                    </button>
                )}
                <a href="./">&gt; PLAY</a>
            </nav>
        </main>
    );
}
