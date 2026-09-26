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
| `npm run gen` | Regenerate `schema/teletronix.schema.json` and `docs/reference.md` after changing the schema |
| `node scripts/convert-phosphor.ts <in> <out>` | Convert a Phosphor JSON file |

## Writing a program
Point `$schema` at `schema/teletronix.schema.json` for validation and autocomplete in your
editor. Invalid programs show their errors in the browser instead of running.

This section is a tour. **[docs/reference.md](docs/reference.md)** lists every property, with its
type and default; it's generated from the schema, so it's always current.

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
| `"link"` | Clickable text with an `action`, and optionally a `secondaryAction` for a shift-click, right-click, Shift+Enter or long press. |
| `"toggle"` | Text that cycles through its `states` when clicked, remembered across visits. |
| `"prompt"` | A command line. Each of its `commands` has an `action`. |
| `"bitmap"` | An image (`src`, `alt`) that resolves from blocky to sharp. The screen waits for it to load. |
| `"progress"` | A text progress bar that runs `from` one percentage `to` another over a `duration`. See below. |
| `"slider"` | A bar the player sets by dragging or with the arrow keys. See below. |

Actions are `{ "screen": "<id>" }` or `{ "dialog": "<id>" }`. Every element takes an optional
`className` (e.g. `"alert"`) and `reveal`.

### Progress bars
```json
{
    "type": "progress",
    "label": "DOWNLOADING ",
    "from": 0, "to": 100, "duration": 3000,
    "onComplete": { "after": 500, "action": { "screen": "done" } },
    "interrupt": { "key": "Escape", "text": "ABORTED", "action": { "screen": "menu" } }
}
```
- `from`/`to` (default 0 and 100) run backwards when `to` is lower. `percent` (default true) shows
  the value; `width` (default: the rest of the line), `fill` and `empty` (default `█` and `░`)
  shape the bar.
- `onComplete` runs an action, or `{ "after", "action" }` to pause first, when the bar reaches
  `to`. Without it, the screen carries on. A dialog opens and the screen carries on behind it.
- `interrupt` makes the bar stop short: at a scripted point (`at`, a transfer that fails) and/or
  when the player presses a `key`. Its `text` replaces the percentage, and its `action` (with
  an optional `after`) runs instead of `onComplete`.
- Skipping jumps the bar to its end, or to its scripted interruption.

### Sliders
```json
{
    "type": "slider",
    "label": "FREQUENCY ",
    "min": 88, "max": 108, "step": 0.1, "value": 94.5, "unit": " MHz",
    "on": [{ "equals": 101.1, "action": { "screen": "transmission" } }],
    "onEnter": { "dialog": "tuned" }
}
```
The player drags the bar (it snaps to each `step`) or focuses it with <tab> and uses ←/→, PageUp/PageDown
and Home/End. It remembers its value. Each `on` rule fires when the value moves into its range
(`atLeast`, `atMost`, `equals`, or a combination); the first rule entered wins. `onEnter` runs when
the player presses <enter> on the slider. `width`, `fill`, `empty` and `showValue` shape it like a
progress bar.

### Moving on without a link
A screen's `next` moves on without a link. Each rule has an `action` and a trigger:
- `after`: milliseconds after the screen has finished revealing
- `key`: `"any"`, a key name (`"Enter"`, `"Space"`, `"Escape"`, `"ArrowRight"`, `"y"`, …), or an array
  of them. The first press finishes revealing the screen, if it hasn't; the next moves on.
  Taps and clicks count as a key too, unless keys in different rules lead to different places.

`next` is one rule or a list, and the first rule to trigger wins:

```json
"next": [
    { "key": "y", "action": { "screen": "evacuate" } },
    { "key": ["n", "Escape"], "action": { "screen": "menu" } },
    { "after": 10000, "action": { "screen": "timeout" } }
]
```

With empty `content`, a screen can be nothing but effects, e.g. a burst of static:

```json
"signal-lost": {
    "effects": { "static": { "opacity": 1 } },
    "next": { "after": 1500, "action": { "screen": "menu" } },
    "content": []
}
```

### Dialogs
`dialogs` holds modal dialogs, opened by any `{ "dialog": "<id>" }` action:
- `"alert"`: a message with one button (`dismiss`, default `"OK"`). Closes with <enter>, <esc> or a click.
- `"confirm"`: a question. `confirm` (<enter>) and `cancel` (<esc>, or a click outside) each have
  a button `text` and an optional `action`.

### Reveals and transitions
Text appears with a **reveal**:
- `"teletype"` (the default): one character at a time (`{ "type": "teletype", "speed": 20 }` sets ms
  per character)
- `"glitch"`: resolves out of random glyphs (`{ "type": "glitch", "duration": 2000 }` sets the total ms).
  When a screen or the config sets it, consecutive elements glitch in together as one block.
- `"instant"`: appears all at once

A screen's `transition` controls how the previous screen leaves: `"none"` (the default: it
disappears at once),
`"glitch"`, where the old screen erases itself over the new one as it appears, or `"fade"`,
where it fades out behind the new one like phosphor afterglow (`{ "type": "fade", "duration": 1500 }`
sets the ms; default 600), or `"static"`, a brief burst of full-screen noise, like changing
channels, before the new screen appears (default 120ms).

Both can be set for the whole program in `config`, per screen, and (for reveals) per element; the
most specific wins. `config.defaults` sets the default options for each kind of reveal:

```json
"config": {
    "name": "My Program",
    "reveal": "glitch",
    "transition": "fade",
    "defaults": { "teletype": { "speed": 20 }, "glitch": { "duration": 800 } }
}
```

### Autoscroll
When a screen is taller than the window, the view scrolls to keep the newest content in view:
the typing cursor, or the element being revealed. Scrolling up to reread stops it; scrolling
back down picks it up again. Each new screen starts at the top. `"autoscroll": false` turns it
off, in `config` for the whole program or on a screen.

### Appearance
`config.theme` sets the colors: `"default"` (pale blue on black), `"amber"`, `"green"`, `"white"`, or your
own, e.g. `{ "fg": "#33ff66", "bg": "#001100" }`. `config.font` picks a typeface: `"ast-premiumexec"`
(the default), `"ibm-vga"`, `"ibm-ega"`, `"ibm-cga"`, `"ibm-cga-thin"`, `"ibm-mda"`,
`"toshiba-satellite"` or `"departure-mono"`. Text is sized to whole multiples of the font's pixel
height, so it stays crisp.

The easiest way to choose is the **settings page**: add `&config` to a program's address, e.g.
<http://localhost:5173/?data=sample&config>. Change the theme, font and effects and watch the
program update beside you, then copy the resulting `config` properties or download the program
with them in place.

### Sound
Teletronix makes its own retro sound effects as it runs, with no audio files: key clicks as text
types, digital crackle for glitches, hiss for static, and beeps for links, toggles, sliders, prompts
and dialogs. An optional CRT hum (`"hum": true`) adds a mains hum and a faint high whine.

Sound is on by default, quietly. `config.sound` turns it off (`false`) or adjusts it:
`{ "volume": 0.5, "typing": false, "hum": true }`. Browsers only play sound once the player has
clicked or pressed a key, so it starts then. Players can mute it with the `[SOUND ON]` toggle in the
corner, and their choice is remembered.

The **sound test page**, <http://localhost:5173/?sound>, has two tabs:
- **Built-in** tunes Teletronix's own sounds: play each one, adjust it with sliders by ear, and
  copy the result over `DEFAULT_VOICES` in `src/ui/sound/voices.ts`.
- **Custom** designs brand new sound effects: roll a preset (laser, explosion, pickup, blip…),
  adjust it, and copy it as JSON. Its synthesizer is a port of [jsfxr](https://github.com/chr15m/jsfxr)
  (public domain), the JavaScript version of DrPetter's classic sfxr.

Edits on both tabs are kept in the browser.

### Right-click menu
The browser's right-click menu is blocked, so a program feels like a terminal rather than a web
page; the prompt's text field keeps its menu, for pasting. `"blockContextMenu": false` in `config`
brings it back.

### Effects
`config.effects` turns visual effects on or off and sets their options. A screen's `effects`
layers over the config's.

| Effect | Default | Options |
|---|---|---|
| `scanlines` | on | `opacity` (0–1, default 0.5), `moving` (a rolling bright band, default true) |
| `static` | off | `opacity` (0–1, default 0.15), `fps` (default 24), `scale` (noise pixel size, default 3) |
| `bloom` | off | `strength` (0–1, default 0.5), `radius` (px, default 8) |
| `vignette` | off | `strength` (0–1, default 0.6) |
| `flicker` | off | `strength` (0–1, default 0.5) |
| `fringe` | off | `strength` (0–1, default 0.6), `offset` (px, default 1) |

```json
"effects": { "scanlines": { "opacity": 0.3 }, "static": true }
```

Moving effects hold still when the system asks for reduced motion.

Fonts: AST PremiumExec from [The Ultimate Oldschool PC Font Pack](https://int10h.org/oldschool-pc-fonts/)
by VileR (CC BY-SA 4.0), and Departure Mono by Helena Zhang (SIL OFL 1.1). Their license texts
are in `public/licenses/`, so every build includes them (served at `licenses/`).

The glitch effect is ported from [musicforprogramming.net](https://musicforprogramming.net).

## Layout
- `src/engine/`: framework-free TypeScript (schema, state machine, navigation, timing, text
  reveals). It can't import React or use the DOM; Biome and the engine's tsconfig enforce this.
- `src/modules/<name>/`: one folder per element type. `definition.ts` holds the schema and
  engine behavior; `View.tsx` holds the React view.
- `src/effects/<name>/`: one folder per visual effect, split the same way as modules.
- `src/ui/`: the React layer. Per-frame text is written straight to the DOM, so React only
  re-renders on structural changes.
