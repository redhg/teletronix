// Converts a Phosphor JSON file to the Teletronix format.
//
//   node scripts/convert-phosphor.ts <phosphor.json> <out.json>
//
// The output is validated before it's written. Anything that can't be converted
// (Phosphor's "console" prompt actions, missing image descriptions) is reported.

import { readFileSync, writeFileSync } from "node:fs";
import { parseProgram, type TeletronixFile } from "../src/engine/schema/program.ts";
import { BLEND_MODES } from "../src/modules/bitmap/definition.ts";

// ─── Phosphor's format ───────────────────────────────────────────────────────

type PhosphorTarget = { target: string; type: "link" | "dialog"; shiftKey?: boolean };
type PhosphorAction = { type: "link" | "dialog" | "console"; target?: string };

type PhosphorContent =
    | string
    | { type: "text"; text: string; className?: string }
    | { type: "link"; text: string; target: string | PhosphorTarget[]; className?: string }
    | { type: "bitmap" | "image"; src: string; alt?: string; className?: string }
    | {
          type: "prompt";
          prompt?: string;
          className?: string;
          commands: { command: string; action: PhosphorAction }[];
      }
    | { type: "toggle"; states: { text: string; active?: boolean }[]; className?: string };

interface PhosphorFile {
    config: { name: string; author?: string; comment?: string };
    screens: { id: string; type: string; content: PhosphorContent[] }[];
    dialogs?: { id: string; type: string; content: string[] }[];
}

// ─── Conversion ──────────────────────────────────────────────────────────────

type Content = NonNullable<TeletronixFile["screens"][string]["content"]>[number];
type Action = { screen: string } | { dialog: string };

const warnings: string[] = [];

function action(type: "link" | "dialog", target: string): Action {
    return type === "dialog" ? { dialog: target } : { screen: target };
}

/** Drops class names that meant something else in Phosphor. */
function className(names: string | undefined, drop: string[] = []): { className?: string } {
    const kept = (names ?? "").split(/\s+/).filter((name) => name && !drop.includes(name));
    return kept.length ? { className: kept.join(" ") } : {};
}

function convertContent(item: PhosphorContent, where: string): Content | null {
    if (typeof item === "string") return item;

    switch (item.type) {
        case "text":
            return { type: "text", text: item.text, ...className(item.className) };

        case "link": {
            if (typeof item.target === "string") {
                return {
                    type: "link",
                    text: item.text,
                    action: { screen: item.target },
                    ...className(item.className),
                };
            }
            const plain = item.target.find((t) => !t.shiftKey);
            const shifted = item.target.find((t) => t.shiftKey);
            const main = plain ?? shifted;
            if (!main) {
                warnings.push(`${where}: link "${item.text}" has no targets; dropped`);
                return null;
            }
            return {
                type: "link",
                text: item.text,
                action: action(main.type, main.target),
                ...(plain && shifted
                    ? { secondaryAction: action(shifted.type, shifted.target) }
                    : {}),
                ...className(item.className),
            };
        }

        case "bitmap":
        case "image": {
            if (!item.alt) warnings.push(`${where}: image ${item.src} has no alt text; add one`);
            // Phosphor blended images with CSS classes; Teletronix has a blend property
            const classes = (item.className ?? "").split(/\s+/);
            const blend = BLEND_MODES.find((mode) => classes.includes(mode));
            const mono = classes.includes("monochrome") ? "luminosity" : undefined;
            return {
                type: "bitmap",
                src: item.src,
                alt: item.alt || "Image",
                ...(blend || mono ? { blend: blend ?? mono } : {}),
                ...className(item.className, [...BLEND_MODES, "monochrome"]),
            };
        }

        case "prompt": {
            const commands = item.commands.flatMap(({ command, action: a }) => {
                if (a.type === "console" || !a.target) {
                    warnings.push(`${where}: command "${command}" (${a.type}) dropped`);
                    return [];
                }
                return [{ command, action: action(a.type, a.target) }];
            });
            return {
                type: "prompt",
                prompt: item.prompt ?? "$> ",
                commands,
                // Phosphor's "cursor" class drew a caret; Teletronix prompts always have one
                ...className(item.className, ["cursor"]),
            };
        }

        case "toggle": {
            const initial = item.states.findIndex((state) => state.active);
            return {
                type: "toggle",
                states: item.states.map((state) => state.text),
                ...(initial > 0 ? { initial } : {}),
                ...className(item.className),
            };
        }
    }
}

function convert(file: PhosphorFile): TeletronixFile {
    const { name, author, comment } = file.config;
    return {
        $schema: "../../schema/teletronix.schema.json",
        config: {
            name,
            ...(author ? { author } : {}),
            ...(comment ? { description: comment } : {}),
        },
        screens: Object.fromEntries(
            file.screens.map((screen) => [
                screen.id,
                {
                    content: screen.content.flatMap((item, index) => {
                        const converted = convertContent(item, `${screen.id}[${index}]`);
                        return converted === null ? [] : [converted];
                    }),
                },
            ]),
        ),
        dialogs: Object.fromEntries(
            (file.dialogs ?? []).map((dialog) => {
                if (dialog.type !== "alert") {
                    warnings.push(`dialog ${dialog.id}: type "${dialog.type}" became "alert"`);
                }
                return [dialog.id, { type: "alert" as const, content: dialog.content }];
            }),
        ),
    };
}

// ─── Main ────────────────────────────────────────────────────────────────────

const [input, output] = process.argv.slice(2);
if (!input || !output) {
    console.error("Usage: node scripts/convert-phosphor.ts <phosphor.json> <out.json>");
    process.exit(1);
}

const converted = convert(JSON.parse(readFileSync(input, "utf8")) as PhosphorFile);
const result = parseProgram(converted);
if (!result.ok) {
    console.error("The converted program is invalid:");
    for (const error of result.errors) console.error(`  ${error.path}: ${error.message}`);
    process.exit(1);
}

writeFileSync(output, `${JSON.stringify(converted, null, 4)}\n`);
for (const warning of warnings) console.warn(`warning: ${warning}`);
console.log(`Wrote ${output}`);
