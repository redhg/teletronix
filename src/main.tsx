import { createRoot } from "react-dom/client";
import { lastProgram } from "./last-program.ts";

// `?config` opens the appearance settings for a program, `?sound` the sound test page,
// `&gm` a GM's control panel for a program played in another window; anything else plays
// a program.
// Each loads only its own code and styles.
const search = lastProgram(location.search);
if (search !== location.search) history.replaceState(null, "", search);
const params = new URLSearchParams(search);
const root = createRoot(document.getElementById("root") as HTMLElement);

if (params.has("sound")) {
    import("./sound-test/start.tsx").then(({ startSoundTest }) => startSoundTest(root));
} else if (params.has("gm")) {
    import("./remote/start.tsx").then(({ startGm }) => startGm(root, params));
} else if (params.has("config")) {
    import("./settings/start.tsx").then(({ startSettings }) => startSettings(root, params));
} else {
    import("./ui/start-player.tsx").then(({ startPlayer }) => startPlayer(root, params));
}
