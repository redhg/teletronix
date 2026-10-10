import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The desktop app runs its TypeScript as it is, from the files electron-builder packs: every
// file its main process imports must be among them, or the installed app won't start (while
// `npm run desktop`, from the repository, works).

const ROOT = new URL("../", import.meta.url).pathname;
const config = JSON.parse(readFileSync(join(ROOT, "desktop/electron-builder.json"), "utf8")) as {
    files: string[];
};

/** A file pattern as a regular expression: "relay/*.ts", "dist/**". */
const pattern = (glob: string) => {
    const literal = (part: string) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    // ("**" is any path; "*", any name within a folder)
    const parts = glob.split("**").map((part) => literal(part).replaceAll("*", "[^/]*"));
    return new RegExp(`^${parts.join(".*")}$`);
};

/** Whether electron-builder packs a file: the last pattern to match it decides. */
function packed(file: string): boolean {
    let included = false;
    for (const glob of config.files) {
        const exclude = glob.startsWith("!");
        if (pattern(exclude ? glob.slice(1) : glob).test(file)) included = !exclude;
    }
    return included;
}

/** Every file the main process imports, by its path from the repository, following imports. */
function importsOf(entry: string): string[] {
    const seen = new Set<string>();
    const visit = (file: string) => {
        if (seen.has(file)) return;
        seen.add(file);
        const source = readFileSync(join(ROOT, file), "utf8");
        for (const [, path] of source.matchAll(/(?:from|import)\s*\(?\s*"(\.{1,2}\/[^"]+)"/g)) {
            visit(relative(ROOT, join(ROOT, dirname(file), path as string)));
        }
    };
    visit(entry);
    return [...seen];
}

describe("the desktop app's package", () => {
    it("has every file its main process imports", () => {
        const files = importsOf("desktop/main.ts");
        expect(files).toContain("relay/core.ts");
        expect(files.filter((file) => !packed(file))).toEqual([]);
    });

    it("leaves out tests", () => {
        expect(packed("relay/core.test.ts")).toBe(false);
        expect(packed("desktop/server.test.ts")).toBe(false);
    });
});
