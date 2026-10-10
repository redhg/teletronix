import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";
import { createRelay } from "./relay/node.ts";
import { buildInfo } from "./scripts/build-info.ts";
import { createSaver } from "./scripts/editor-save.ts";

const BACKGROUND = "#000c0c";

/**
 * Lets a GM's panel on one device control a players' terminal on another, through the dev
 * or preview server (see relay/node.ts): its addresses as a middleware, and its WebSocket
 * on the server's upgrade requests.
 */
function remoteRelay(): Plugin {
    // (other devices can reach the server only when it's started with --host)
    const open = (host: string | boolean | undefined) =>
        host === true || (typeof host === "string" && !["localhost", "127.0.0.1"].includes(host));
    return {
        name: "teletronix-remote-relay",
        configureServer: (server) => {
            const relay = createRelay({ exposed: () => open(server.config.server.host) });
            server.middlewares.use(relay);
            server.httpServer?.on("upgrade", relay.upgrade);
        },
        configurePreviewServer: (server) => {
            const relay = createRelay({ exposed: () => open(server.config.preview.host) });
            server.middlewares.use(relay);
            server.httpServer.on("upgrade", relay.upgrade);
        },
    };
}

/**
 * Stamps the build with its version, commit and time: in the page (`teletronix.version`, see
 * src/version.ts), and as version.json beside it, which `?version` reads fresh to compare.
 */
function versionStamp(): Plugin {
    const info = buildInfo(new URL("./", import.meta.url));
    const json = JSON.stringify(info);
    return {
        name: "teletronix-version",
        config: () => ({ define: { __TELETRONIX_BUILD__: json } }),
        generateBundle() {
            this.emitFile({ type: "asset", fileName: "version.json", source: `${json}\n` });
        },
        configureServer: (server) =>
            void server.middlewares.use("/version.json", (_req, res) => {
                res.setHeader("Content-Type", "application/json");
                res.end(json);
            }),
    };
}

export default defineConfig({
    // relative asset paths so a build can be hosted from any subdirectory
    base: "./",
    plugins: [
        react(),
        versionStamp(),
        remoteRelay(),
        // the editor (`?edit`) saves programs straight into public/data, in the dev server
        {
            name: "teletronix-editor-save",
            configureServer: (server) =>
                void server.middlewares.use(
                    createSaver(new URL("./public/data/", import.meta.url)),
                ),
        },
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
                globPatterns: [
                    "**/*.{html,js,css,woff,woff2,otf,png,jpg,gif,svg,json,txt,mp3,ogg,wav,m4a,webm,mp4,m4v}",
                ],
                // programs' images and audio can be large
                maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
                // (left out, so `?version` always reads the one deployed now)
                globIgnores: ["version.json"],
                // every address (e.g. ?data=ypsilon14) is the same page
                navigateFallback: "index.html",
                cleanupOutdatedCaches: true,
            },
        }),
    ],
    test: {
        include: [
            "src/**/*.test.ts",
            "scripts/**/*.test.ts",
            "desktop/**/*.test.ts",
            "relay/**/*.test.ts",
        ],
        environment: "node",
    },
});
