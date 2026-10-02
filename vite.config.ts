import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";
import { createRelay } from "./scripts/remote-relay.ts";

const BACKGROUND = "#000c0c";

/**
 * Lets a GM's panel on one device control a players' terminal on another, through the dev
 * or preview server (see scripts/remote-relay.ts).
 */
function remoteRelay(): Plugin {
    const relay = createRelay();
    return {
        name: "teletronix-remote-relay",
        configureServer: (server) => void server.middlewares.use(relay),
        configurePreviewServer: (server) => void server.middlewares.use(relay),
    };
}

export default defineConfig({
    // relative asset paths so a build can be hosted from any subdirectory
    base: "./",
    plugins: [
        react(),
        remoteRelay(),
        // Works offline, and installs as an app: a service worker caches everything the
        // build contains, including the programs in public/data and their images.
        VitePWA({
            // A new version waits until every Teletronix tab or window has closed, so it
            // never reloads the page in the middle of a session.
            registerType: "prompt",
            injectRegister: "script-defer",
            manifest: {
                name: "Teletronix",
                short_name: "Teletronix",
                description: "A retro terminal for interactive fiction and tabletop games",
                start_url: "./",
                scope: "./",
                display: "fullscreen",
                display_override: ["fullscreen", "standalone"],
                background_color: BACKGROUND,
                theme_color: BACKGROUND,
                icons: [
                    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
                    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
                    {
                        src: "icons/icon-512.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "maskable",
                    },
                ],
            },
            workbox: {
                globPatterns: ["**/*.{html,js,css,woff,woff2,png,jpg,gif,svg,json,txt}"],
                // programs' images can be large
                maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
                // every address (e.g. ?data=ypsilon14) is the same page
                navigateFallback: "index.html",
                cleanupOutdatedCaches: true,
            },
        }),
    ],
    test: {
        include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
        environment: "node",
    },
});
