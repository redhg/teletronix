import { createRoot } from "react-dom/client";

// `?config` opens the appearance settings for a program; anything else plays it.
// Each loads only its own code and styles.
const params = new URLSearchParams(location.search);
const root = createRoot(document.getElementById("root") as HTMLElement);

if (params.has("config")) {
    import("./settings/start.tsx").then(({ startSettings }) => startSettings(root, params));
} else {
    import("./ui/start-player.tsx").then(({ startPlayer }) => startPlayer(root, params));
}
