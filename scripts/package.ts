import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join, normalize, resolve, sep } from "node:path";
import { makePackage } from "./ttx.ts";

// Makes a Teletronix package (.ttx) of a program and the files it names, from beside it (as
// public/data has them), or Teletronix's own public/data:
//
//   node scripts/package.ts public/data/tape7.json            → tape7.ttx, here
//   node scripts/package.ts ~/heist/heist.json ~/heist.ttx

const [input, output] = process.argv.slice(2);
if (!input) {
    console.error("Usage: node scripts/package.ts <program.json> [<package.ttx>]");
    process.exit(1);
}
const program = resolve(input);
const name = basename(program, extname(program));
const out = resolve(output ?? `${name}.ttx`);
const folders = [dirname(program), resolve(import.meta.dirname, "../public/data")];

/** A file the program names ("data/…"), from the first folder that has it. */
async function find(path: string): Promise<Buffer | null> {
    for (const folder of folders) {
        const file = normalize(join(folder, path.slice("data/".length)));
        if (!file.startsWith(folder + sep)) continue;
        const data = await readFile(file).catch(() => null);
        if (data) return data;
    }
    return null;
}

const { files, missing } = await makePackage(
    { name, text: await readFile(program, "utf8") },
    find,
    out,
);
console.log(`Wrote ${out}: the program, and ${files.length} file${files.length === 1 ? "" : "s"}`);
if (missing.length) {
    console.warn(`Not found, so left out:\n${missing.map((path) => `  ${path}`).join("\n")}`);
    process.exitCode = 1;
}
