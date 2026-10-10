import { defineConfig } from "@playwright/test";

// The desktop app's own test (`npm run test:desktop`): it starts the app, so it runs apart
// from the browser tests in e2e/.
export default defineConfig({
    testDir: ".",
    testMatch: "*.spec.ts",
    timeout: 60_000,
    // (starting the app is slower than loading a page: on a fresh CI runner, its first window
    // can take several seconds to draw)
    expect: { timeout: 20_000 },
    reporter: "list",
});
