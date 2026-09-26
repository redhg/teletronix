import { defineConfig } from "@playwright/test";

const PORT = 4173;
const CI = Boolean(process.env.CI);

/**
 * Browser tests, in every engine Teletronix supports. They run against a production
 * build (what ships, and without the dev server's reloads while it optimizes
 * dependencies), served on its own port so a running dev server doesn't matter.
 */
export default defineConfig({
    testDir: "e2e",
    fullyParallel: true,
    forbidOnly: CI,
    retries: CI ? 1 : 0,
    reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
    use: {
        baseURL: `http://localhost:${PORT}/`,
        viewport: { width: 1000, height: 700 },
        // reveals and transitions are instant unless a test asks for motion
        reducedMotion: "reduce",
        trace: "retain-on-failure",
        // fail fast on a missing element, rather than at the test timeout
        actionTimeout: 10_000,
    },
    projects: [
        { name: "chromium", use: { browserName: "chromium" } },
        { name: "firefox", use: { browserName: "firefox" } },
        { name: "webkit", use: { browserName: "webkit" } },
    ],
    webServer: {
        command: `npx vite build --logLevel warn && npx vite preview --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: false,
        timeout: 60_000,
    },
});
