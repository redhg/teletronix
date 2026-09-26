import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    // relative asset paths so a build can be hosted from any subdirectory
    base: "./",
    plugins: [react()],
    test: {
        include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
        environment: "node",
    },
});
