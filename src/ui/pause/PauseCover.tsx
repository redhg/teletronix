import { useEffect, useRef } from "react";
import type { PauseCover as Cover, ResolvedEffects } from "../../engine/index.ts";
import { EffectsLayer } from "../effects.tsx";
import "./pause.css";

/**
 * What covers the screen while the GM has paused the program: a message (PLEASE STAND BY),
 * and an image behind it if they chose one, on the same glass (the effects over it). Only
 * the GM lifts it: it has no button, and Esc doesn't close it.
 */
export function PauseCover({ cover, effects }: { cover: Cover; effects: ResolvedEffects }) {
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        dialog.current?.showModal();
    }, []);
    return (
        <dialog
            ref={dialog}
            className="pause-cover"
            aria-label="Paused"
            onCancel={(event) => event.preventDefault()}
        >
            {cover.image && <img className="pause-image" src={cover.image} alt="" />}
            <div className="pause-message" role="status">
                {cover.message}
            </div>
            <EffectsLayer effects={effects} />
        </dialog>
    );
}
