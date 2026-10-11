import { type FormEvent, useEffect, useRef, useState } from "react";
import { readPackage } from "../package/browser.ts";
import { choosePackage } from "../package/open.ts";
import { putPackage } from "../package/store.ts";
import "../ui/terminal.css";
import { cleanJoinCode, randomId } from "./codes.ts";
import { rememberJoinCode } from "./follow.ts";
import { sessionLink } from "./link.ts";
import { PackageArrival, sizeText } from "./packages-share.ts";
import type { GmMessage, PlayerMessage } from "./protocol.ts";
import type { Refusal } from "./relay-protocol.ts";

/** Where getting the package has got to. */
type Step =
    | { step: "code" }
    | { step: "asking" }
    | { step: "waiting" }
    | { step: "offered"; fileName: string; size: number }
    | { step: "receiving"; fileName: string; progress: number }
    | { step: "unavailable"; reason: "not-shared" | "too-big" }
    | { step: "refused"; reason: Refusal }
    | { step: "failed"; message: string };

/**
 * A players' window opened with the address of a package it hasn't got, in a GM's session
 * (e.g. from the GM's QR code): it asks the GM's panel for it, and once the player accepts the
 * GM's offer, gets it, keeps it, and plays it. Or the player chooses its file, as ever.
 */
export function ReceivePackage({
    program,
    id,
    code: given,
}: {
    /** The program's name in the address: "ttx:heist" */
    program: string;
    /** The package's: "heist" */
    id: string;
    /** The session's join code, if the address (or last time) gave it */
    code: string | null;
}) {
    const [code, setCode] = useState(given);
    const [step, setStep] = useState<Step>(given ? { step: "asking" } : { step: "code" });
    const send = useRef<(message: PlayerMessage) => void>(() => {});
    const player = useRef(randomId());

    useEffect(() => {
        if (!code) return;
        rememberJoinCode(program, code);
        const me = player.current;
        const arrival = new PackageArrival();
        let offered = { fileName: `${id}.ttx`, size: 0 };
        const ask = () => link.send({ type: "package-wanted", player: me, package: id });
        const finish = async () => {
            try {
                const file = arrival.blob();
                await readPackage(file, offered.fileName);
                // (listed as from a session: its title mustn't show on a player's screens)
                await putPackage(
                    { id, fileName: offered.fileName, file, added: Date.now() },
                    { from: "session" },
                );
                location.reload();
            } catch (error) {
                setStep({
                    step: "failed",
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        };
        const link = sessionLink(
            { player: { code, id: me } },
            (received) => {
                const message = received as GmMessage;
                switch (message.type) {
                    case "package-offer":
                        if (message.package !== id) return;
                        offered = { fileName: message.fileName, size: message.size };
                        setStep({ step: "offered", ...offered });
                        return;
                    case "package-unavailable":
                        if (message.package === id) {
                            setStep({ step: "unavailable", reason: message.reason });
                        }
                        return;
                    case "package-piece":
                        if (message.package !== id) return;
                        if (arrival.take(message.index, message.count, message.data)) {
                            void finish();
                        } else {
                            setStep({
                                step: "receiving",
                                fileName: offered.fileName,
                                progress: arrival.progress,
                            });
                        }
                        return;
                }
            },
            undefined,
            {
                // (ask once the GM's there: now, or when it comes)
                gm: (present) => {
                    if (present) ask();
                    else setStep((was) => (was.step === "asking" ? { step: "waiting" } : was));
                },
                refused: (reason) => setStep({ step: "refused", reason }),
            },
        );
        send.current = (message) => link.send(message);
        return () => link.close();
    }, [code, id, program]);

    const accept = () => {
        if (step.step !== "offered") return;
        setStep({ step: "receiving", fileName: step.fileName, progress: 0 });
        send.current({ type: "package-accepted", player: player.current, package: id });
    };

    return (
        <main className="terminal error-view receive-package">
            {/* (never the package's name, nor its file's: either could give something away) */}
            <h1>THIS PROGRAM ISN'T IN THIS BROWSER</h1>
            {step.step === "code" && <CodeField join={setCode} />}
            {step.step === "asking" && <p>ASKING THE GM FOR IT…</p>}
            {step.step === "waiting" && <p>WAITING FOR THE GM, IN SESSION {code}…</p>}
            {step.step === "offered" && (
                <>
                    <p>THE GM IS SHARING PROGRAM DATA ({sizeText(step.size)}).</p>
                    <button type="button" className="error-action" onClick={accept}>
                        &gt; ACCEPT
                    </button>
                </>
            )}
            {step.step === "receiving" && (
                <p role="status">RECEIVING PROGRAM DATA… {Math.round(step.progress * 100)}%</p>
            )}
            {step.step === "unavailable" && (
                <p className="alert">
                    {step.reason === "too-big"
                        ? "THE GM'S PACKAGE IS TOO BIG TO SHARE THIS WAY."
                        : "THE GM ISN'T PLAYING THIS PACKAGE."}
                </p>
            )}
            {step.step === "refused" && (
                <p className="alert">
                    {step.reason === "removed"
                        ? "THE GM TOOK THIS DEVICE OUT OF THE SESSION."
                        : "THAT SESSION ISN'T AVAILABLE."}
                </p>
            )}
            {step.step === "failed" && <p className="alert">CAN'T OPEN IT: {step.message}</p>}
            <button type="button" className="error-action" onClick={() => choosePackage()}>
                &gt; CHOOSE ITS FILE INSTEAD…
            </button>
        </main>
    );
}

/** The session's code, to ask its GM for the package. */
function CodeField({ join }: { join: (code: string) => void }) {
    const [typed, setTyped] = useState("");
    const submit = (event: FormEvent) => {
        event.preventDefault();
        const code = cleanJoinCode(typed);
        if (code) join(code);
    };
    return (
        <form onSubmit={submit}>
            <label>
                THE GM'S SESSION CODE:{" "}
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
                    onChange={(event) => setTyped(event.currentTarget.value.toUpperCase())}
                />
            </label>{" "}
            <button type="submit" className="error-action" disabled={!cleanJoinCode(typed)}>
                &gt; ASK THE GM FOR IT
            </button>
        </form>
    );
}
