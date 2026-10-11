import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

// GM keys: what lets a GM's panel share packages through Cloudflare (relay/packages.ts). Only
// each key's fingerprint is kept there, with a label; the key itself is shown once, here, to
// give to the GM, who puts it in the panel (Devices → Sharing). Through Wrangler, so it needs
// `npx wrangler login` first.
//
//   npm run relay:key -- add "Breon"      a new key, labelled
//   npm run relay:key -- list             the keys there are, by label
//   npm run relay:key -- remove "Breon"   takes it back, at once

const BINDING = "GM_KEYS";

function wrangler(args: string[]): string {
    const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
    return execFileSync("npx", ["wrangler", "kv", ...args, "--binding", BINDING, "--remote"], {
        encoding: "utf8",
        env: { ...env, WRANGLER_SEND_METRICS: "false" },
        stdio: ["ignore", "pipe", "pipe"],
    });
}

interface Listed {
    name: string;
    metadata?: { label?: string; added?: string };
}

/** The keys there are: their fingerprints, labels and when they were added. */
function keys(): Listed[] {
    const output = wrangler(["key", "list"]);
    const listed = JSON.parse(output.slice(output.indexOf("["))) as Listed[];
    // (not the keys' uploads, kept beside them)
    return listed.filter((item) => !item.name.startsWith("usage:"));
}

const [command, label] = process.argv.slice(2);
switch (command) {
    case "add": {
        if (!label) throw new Error('Name it: npm run relay:key -- add "Breon"');
        if (keys().some((item) => item.metadata?.label === label)) {
            throw new Error(`There's a key labelled "${label}" already`);
        }
        const key = `ttx_${randomBytes(24).toString("base64url")}`;
        const print = createHash("sha256").update(key).digest("hex");
        const metadata = JSON.stringify({ label, added: new Date().toISOString().slice(0, 10) });
        wrangler(["key", "put", print, label, "--metadata", metadata]);
        console.log(
            `A key for "${label}" (shown only now: keep it, or give it to them):\n\n  ${key}\n`,
        );
        console.log("In the GM's panel: Devices → Sharing → Upload key.");
        break;
    }
    case "list": {
        const all = keys();
        if (all.length === 0) console.log("No keys yet.");
        for (const item of all) {
            console.log(
                `${item.metadata?.label ?? "(no label)"}  added ${item.metadata?.added ?? "?"}`,
            );
        }
        break;
    }
    case "remove": {
        const found = keys().filter((item) => item.metadata?.label === label);
        if (found.length === 0) throw new Error(`No key labelled "${label}"`);
        for (const item of found) wrangler(["key", "delete", item.name]);
        console.log(`Removed the key for "${label}": it no longer uploads.`);
        break;
    }
    default:
        console.log("npm run relay:key -- add <label> | list | remove <label>");
}
