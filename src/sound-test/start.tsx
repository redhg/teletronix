import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { SoundTestApp } from "./SoundTestApp.tsx";
// (the look the old settings page shared with it, until it moves into the editor)
import "./base.css";
import "./sound-test.css";

/** `?sound`: a page for tuning the generated sound effects by ear. */
export function startSoundTest(root: Root): void {
    document.title = "Teletronix: sound test";
    root.render(
        <StrictMode>
            <SoundTestApp />
        </StrictMode>,
    );
}
