# Teletronix
A retrofuturistic terminal simulator for tabletop role-playing games.

A JSON file describes screens of text that type themselves in, links between screens, and
(soon) prompts, dialogs and CRT effects. Teletronix is the successor to Phosphor.

## Getting started
Requires Node 24+ and pnpm (`corepack enable pnpm`).

```sh
pnpm install
pnpm dev          # http://localhost:5173
```

Programs live in `public/data/`. Pick one with `?data=<name>`; the default is `sample`.

| Script | |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Typecheck and build to `dist/` |
| `pnpm test` | Unit tests |
| `pnpm lint` / `pnpm format` | Biome check / fix |
| `pnpm gen:schema` | Regenerate `schema/teletronix.schema.json` after changing the schema |

## Writing a program
Point `$schema` at `schema/teletronix.schema.json` for validation and autocomplete in your
editor. Invalid programs show their errors in the browser instead of running.

```json
{
    "$schema": "../../schema/teletronix.schema.json",
    "config": { "name": "My Program" },
    "screens": {
        "home": {
            "content": [
                "A bare string is a line of text.",
                { "type": "text", "text": "This one is red.", "className": "alert" },
                { "type": "link", "text": "> NEXT", "action": { "screen": "next" } }
            ]
        },
        "next": { "content": ["The end."] }
    }
}
```

## Layout
- `src/engine/`: framework-free TypeScript (schema, state machine, navigation, timing, text
  reveals). It can't import React or use the DOM; Biome and the engine's tsconfig enforce this.
- `src/modules/<name>/`: one folder per element type. `definition.ts` holds the schema and
  engine behavior; `View.tsx` holds the React view.
- `src/ui/`: the React layer. Per-frame text is written straight to the DOM, so React only
  re-renders on structural changes.
