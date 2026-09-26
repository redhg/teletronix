# Teletronix
A retrofuturistic terminal simulator for tabletop role-playing games.

A JSON file describes screens of text that type themselves in, links between screens, and (soon) prompts, dialogs and CRT effects. Teletronix is the successor to Phosphor.

## Getting started
Requires Node 24+.

```sh
npm install
npm run dev    # http://localhost:5173
```

Programs live in `public/data/`. Pick one with `?data=<name>`; the default is `sample`.
`?data=ypsilon14` runs *The Haunting of Ypsilon-14*, converted from Phosphor.

| Script | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck and build to `dist/` |
| `npm test` | Unit tests |
| `npm run lint` / `npm run format` | Biome check / fix |
| `npm run gen:schema` | Regenerate `schema/teletronix.schema.json` after changing the schema |
| `node scripts/convert-phosphor.ts <in> <out>` | Convert a Phosphor JSON file |

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

### Elements
A screen's `content` is a list of elements, revealed one after another:

| Type | |
|---|---|
| `"text"` (or a bare string) | Text. Line breaks are kept; long lines wrap. |
| `"link"` | Clickable text with an `action`, and optionally a `shiftAction` for shift-click. |
| `"toggle"` | Text that cycles through its `states` when clicked, remembered across visits. |
| `"prompt"` | A command line. Each of its `commands` has an `action`. |
| `"bitmap"` | An image (`src`, `alt`) that resolves from blocky to sharp. The screen waits for it to load. |

Actions are `{ "screen": "<id>" }` or `{ "dialog": "<id>" }`. Every element takes an optional
`className` (e.g. `"alert"`) and `reveal`.

### Reveals and transitions
Text appears with a **reveal**, set per element, per screen or in `config.defaults`:
- `"teletype"`: one character at a time (`{ "type": "teletype", "speed": 20 }` sets ms per character)
- `"glitch"`: resolves out of random glyphs (`{ "type": "glitch", "duration": 2000 }` sets the total ms).
  When a screen or the config sets it, consecutive elements glitch in together as one block.
- `"none"`: appears at once

A screen's `transition` controls how the previous screen leaves: `"cut"` (the default) or
`"glitch"`, where the old screen erases itself over the new one as it appears.

The glitch effect is ported from [musicforprogramming.net](https://musicforprogramming.net).

## Layout
- `src/engine/`: framework-free TypeScript (schema, state machine, navigation, timing, text
  reveals). It can't import React or use the DOM; Biome and the engine's tsconfig enforce this.
- `src/modules/<name>/`: one folder per element type. `definition.ts` holds the schema and
  engine behavior; `View.tsx` holds the React view.
- `src/ui/`: the React layer. Per-frame text is written straight to the DOM, so React only
  re-renders on structural changes.
