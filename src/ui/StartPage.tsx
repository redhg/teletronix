import { type FormEvent, useEffect, useState } from "react";
import { choosePackage } from "../package/open.ts";
import { listPackages, PACKAGE_PREFIX, type PackageListing } from "../package/store.ts";
import { cleanJoinCode, randomId } from "../remote/codes.ts";
import { sessionLink } from "../remote/link.ts";
import type { GmMessage } from "../remote/protocol.ts";
import { formatTyped } from "../remote/RemoteBadge.tsx";
import type { Refusal } from "../remote/relay-protocol.ts";
import { BUILD } from "../version.ts";
import "./terminal.css";

// The start page, for an address without a program (`?data=`): join a GM's session, open a
// package, play one opened here before, or try a demo.

/** The programs that come with Teletronix, to try it with. */
const DEMOS = [
    { name: "sample", title: "TELETRONIX SAMPLE", about: "EVERY FEATURE, ONE AT A TIME" },
    { name: "tape7", title: "TAPE 7", about: "A SHORT MYSTERY, ON A VCR" },
    { name: "ypsilon14", title: "THE HAUNTING OF YPSILON-14", about: "A MOTHERSHIP MODULE" },
];

const DOCS = "https://github.com/redhg/teletronix#documentation";

/** "TODAY", "YESTERDAY", or how many days ago. */
function when(added: number, now = Date.now()): string {
    const days = Math.floor((now - added) / 86_400_000);
    return days <= 0 ? "TODAY" : days === 1 ? "YESTERDAY" : `${days} DAYS AGO`;
}

/** An address, keeping this one's kiosk (a dedicated screen stays one). */
const address = (query: string) =>
    new URLSearchParams(location.search).has("kiosk") ? `${query}&kiosk` : query;

export function StartPage() {
    const [recent, setRecent] = useState<PackageListing[]>([]);
    useEffect(() => {
        listPackages().then(setRecent, () => setRecent([]));
    }, []);

    return (
        <main className="terminal start-page">
            <header>
                <h1>TELETRONIX</h1>
                <p className="dim">A TERMINAL FOR TABLETOP GAMES.</p>
            </header>

            <JoinSession />

            <section aria-labelledby="open">
                <h2 id="open">PLAY A PACKAGE</h2>
                <button type="button" className="start-link" onClick={() => choosePackage()}>
                    &gt; OPEN A PACKAGE (.TTX)…
                </button>
                <p className="dim">OR DROP ONE ON THIS PAGE.</p>
                {recent.length > 0 && (
                    <ul aria-label="Opened here">
                        {recent.map((item) => (
                            <li key={item.id}>
                                <a
                                    className="start-link"
                                    href={address(`?data=${PACKAGE_PREFIX}${item.id}`)}
                                >
                                    {/* (one a GM shared, by no name: it could give something away) */}
                                    &gt;{" "}
                                    {item.from === "session"
                                        ? "PROGRAM DATA FROM A SESSION"
                                        : (item.title ?? "A PACKAGE").toUpperCase()}
                                </a>
                                {item.from === "opened" && (
                                    <>
                                        {" "}
                                        <a
                                            className="start-link"
                                            href={`?data=${PACKAGE_PREFIX}${item.id}&gm`}
                                            aria-label={`GM panel for ${item.title ?? "it"}`}
                                        >
                                            [GM]
                                        </a>
                                    </>
                                )}{" "}
                                <span className="dim">{when(item.added)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section aria-labelledby="demos">
                <h2 id="demos">DEMOS</h2>
                <ul>
                    {DEMOS.map((demo) => (
                        <li key={demo.name}>
                            <a className="start-link" href={address(`?data=${demo.name}`)}>
                                &gt; {demo.title}
                            </a>{" "}
                            <a
                                className="start-link"
                                href={`?data=${demo.name}&gm`}
                                aria-label={`GM panel for ${demo.title}`}
                            >
                                [GM]
                            </a>{" "}
                            <span className="dim">{demo.about}</span>
                        </li>
                    ))}
                </ul>
            </section>

            <footer className="dim">
                v{BUILD.version} ·{" "}
                <a className="start-link" href={DOCS} target="_blank" rel="noreferrer">
                    DOCUMENTATION
                </a>{" "}
                ·{" "}
                <a className="start-link" href="?version">
                    WHICH VERSION?
                </a>
            </footer>
        </main>
    );
}

/** Where joining has got to. */
type Joining =
    | { step: "typing" }
    | { step: "asking"; code: string }
    | { step: "waiting"; code: string }
    | { step: "refused"; reason: Refusal };

/**
 * Joining a GM's session by its code alone: it asks the GM's panel which program it's playing,
 * then goes there, in the session (where a package it hasn't got is offered, as ever).
 */
function JoinSession() {
    const [typed, setTyped] = useState("");
    const [joining, setJoining] = useState<Joining>({ step: "typing" });
    const code = joining.step === "asking" || joining.step === "waiting" ? joining.code : null;

    useEffect(() => {
        if (!code) return;
        const me = randomId();
        const link = sessionLink(
            { player: { code, id: me } },
            (received) => {
                const message = received as GmMessage;
                // (only a program's name, as an address has it: nothing else to go to)
                if (message.type !== "program" || !/^(ttx:)?[\w-]+$/.test(message.program)) return;
                link.close();
                location.assign(
                    address(`?data=${encodeURIComponent(message.program)}&join=${code}`),
                );
            },
            undefined,
            {
                gm: (present) => {
                    if (present) link.send({ type: "program-wanted", player: me });
                    else setJoining({ step: "waiting", code });
                },
                refused: (reason) => setJoining({ step: "refused", reason }),
            },
        );
        return () => link.close();
    }, [code]);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const clean = cleanJoinCode(typed);
        if (clean) setJoining({ step: "asking", code: clean });
    };

    return (
        <section aria-labelledby="join">
            <h2 id="join">JOIN A GM'S SESSION</h2>
            <form onSubmit={submit}>
                <label>
                    CODE:{" "}
                    <input
                        aria-label="Session code"
                        className="receive-code"
                        value={typed}
                        placeholder="BCDF-1234"
                        size={9}
                        maxLength={9}
                        autoCapitalize="characters"
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(event) => setTyped(formatTyped(event.currentTarget.value))}
                    />
                </label>{" "}
                <button type="submit" className="start-link" disabled={!cleanJoinCode(typed)}>
                    &gt; JOIN
                </button>
            </form>
            {joining.step === "asking" && <p role="status">ASKING THE GM…</p>}
            {joining.step === "waiting" && (
                <p role="status">WAITING FOR THE GM, IN SESSION {joining.code}…</p>
            )}
            {joining.step === "refused" && (
                <p className="alert" role="alert">
                    {joining.reason === "too-many"
                        ? "TOO MANY TRIES. WAIT A MINUTE, THEN TRY AGAIN."
                        : joining.reason === "removed"
                          ? "THE GM TOOK THIS DEVICE OUT OF THE SESSION."
                          : "THAT SESSION ISN'T AVAILABLE."}
                </p>
            )}
        </section>
    );
}
