import { createRoot } from "react-dom/client";
import { lastProgram } from "./last-program.ts";
import { exposeVersion } from "./version.ts";

// `?edit` opens the program editor, `&gm` a GM's control panel for a program played in
// another window, `?version` which build this is; `?data=<name>` plays a program, and an
// address without one is the start page.
// Each loads only its own code and styles.
const search = lastProgram(location.search);
if (search !== location.search) history.replaceState(null, "", search);
const params = new URLSearchParams(search);
const root = createRoot(document.getElementById("root") as HTMLElement);

// `teletronix.version` in the console: which build this is
exposeVersion();

if (params.has("version")) {
    import("./ui/start-version.tsx").then(({ startVersion }) => startVersion(root));
} else if (params.has("gm")) {
    import("./remote/start.tsx").then(({ startGm }) => startGm(root, params));
} else if (params.has("edit")) {
    import("./editor/start.tsx").then(({ startEditor }) => startEditor(root, params));
} else if (!params.has("data") && !params.has("preview")) {
    import("./ui/start-page.tsx").then(({ startPage }) => startPage(root));
} else {
    import("./ui/start-player.tsx").then(({ startPlayer }) => startPlayer(root, params));
}
