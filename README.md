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
| `npm run test:e2e` | Browser tests, in Chromium, Firefox and WebKit (see [Tests](#tests)) |
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
| `"text"` (or a bare string) | Text: a string, or a list of lines. Line breaks are kept; long lines wrap unless `"wrap": false`. |
| `"link"` | Clickable text with an `action`, and optionally a `secondaryAction` for a shift-click, right-click, Shift+Enter or long press. |
| `"toggle"` | Text that cycles through its `states` when clicked, remembered across visits. |
| `"prompt"` | A command line. Each of its `commands` has an `action`; `onEnter` takes anything else. |
| `"bitmap"` | An image (`src`, `alt`) that resolves from blocky to sharp. The screen waits for it to load. |
| `"progress"` | A text progress bar that runs `from` one percentage `to` another over a `duration`. See below. |
| `"slider"` | A bar the player sets by dragging or with the arrow keys. See below. |
| `"section"` | A header that expands and collapses the elements under it. See below. |
| `"pause"` | Stops the reveal with "-- PRESS ANY KEY TO CONTINUE --" until a key or tap. See below. |

Actions are `{ "screen": "<id>" }` or `{ "dialog": "<id>" }`, and can also change variables
(see [Variables and conditions](#variables-and-conditions)). Every element takes an optional
`className` (e.g. `"alert"`), `reveal`, and `if`.

### Alignment and preformatted text
`"align": "center"` or `"right"` places text, links and toggles across the screen. A screen or
the config can set `align` for all of them. Like a text-mode display, alignment works in whole
character columns, and centered or right-aligned text moves **as one block**: its widest line
decides where every line starts, so the lines keep their shape. A one-line title lands in the
middle; a link's text is centered in its full-width bar.

For ASCII art, write the text as a list of lines, and set `"wrap": false` so it's kept exactly
as written. Lines wider than the screen are cut off at the right edge instead of wrapping.

```json
{
    "type": "text",
    "wrap": false,
    "align": "center",
    "text": [
        "╔═══════════╗",
        "║  YPSILON  ║",
        "╚═══════════╝"
    ]
}
```

Tip: the PC fonts draw `|` as a broken bar (`¦`), as the original hardware did. For lines and
boxes, use the box-drawing characters (`│ ─ ┌ ┐ └ ┘ ║ ═ ╔ ╗ ╚ ╝` and friends), which they draw
edge to edge.

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
and Home/End. It remembers its value. Each `on` rule is a range (`atLeast`, `atMost`, `equals`,
or a combination) with an `action`, a `className`, or both. An action fires when the value moves
into its range (the first rule entered wins); a class applies for as long as the value is in the
range, so `{ "atLeast": 80, "className": "alert" }` turns the slider red from 80 up. `onEnter` runs when
the player presses <enter> on the slider. `width`, `fill`, `empty` and `showValue` shape it like a
progress bar.

### Sections
```json
{
    "type": "section",
    "title": "CREW MANIFEST",
    "content": [
        "CAPT. R. OKAFOR      COMMAND",
        { "type": "link", "text": "> VANCE'S LOG", "action": { "screen": "vance-log" } }
    ]
}
```
A section's header (`[+] CREW MANIFEST`) expands and collapses the elements in its `content`, which
can be any elements, including other sections. Expanding reveals them in place, with the
section's `reveal` (e.g. `"instant"`) or the screen's; collapsing hides them at once. A section
starts collapsed unless it sets `"open": true`, in which case its contents reveal before the
rest of the screen. It remembers whether it's open when you come back. `markers` changes what
the header shows before the title: `{ "closed": "▶", "open": "▼" }`. `indent` moves the contents
that many columns in, to show they belong to the header; they wrap to the narrower width.

### Pauses
```json
{ "type": "pause", "text": "[ MORE ]", "align": "center" }
```
A pause stops the screen's reveal and shows its `text` (default
`-- PRESS ANY KEY TO CONTINUE --`) until the player presses a key or taps. Then the line goes and
the reveal carries on, so a long screen can be read a page at a time. Skipping stops at each
pause too. A pause inside an open section holds the whole screen.

### Header and status bars
```json
"config": {
    "header": [{ "left": "YPSILON-14 CONTROL", "right": "SECTOR 14/B" }],
    "footer": [{
        "left": "USER: {name}",
        "center": "CREDITS: {credits}",
        "right": { "text": "[?] HELP", "action": { "dialog": "help" } }
    }]
}
```
`header` and `footer` are lines pinned to the top and bottom of the window, in inverse video.
They don't scroll or reveal, and stay put between screens. Each line is text, or `left`,
`center` and `right` spread across the screen's columns; each of those is text or a link
(`{ "text", "action" }`), which works at any time. Variables in them update as they change.
A line with `"className": "plain"` uses the screen's own colors, e.g. as a gap under the
header. A screen can set its own `header`/`footer`, or `false` to hide one.

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

### Variables and conditions
`config.variables` declares the program's variables and their starting values: true or false, a
number, or text. They last until the page reloads.

```json
"variables": { "keycard": false, "power": 40, "name": "" }
```

**Setting them.** Any action can `set` variables, with or without going anywhere. `{ "add": n }`
adds to a number:

```json
{ "type": "link", "text": "> TAKE THE KEYCARD", "action": { "set": { "keycard": true }, "screen": "hall" } }
{ "type": "link", "text": "> BOOST", "action": { "set": { "power": { "add": 10 } } } }
```

Variables change before the action goes anywhere, so the next screen sees the new values.

**Binding controls.** With `"variable"`, a control keeps its value in a variable (and starts
from it):
- a toggle: `true`/`false` for two states (the second is `true`), otherwise the state's index from 0
- a slider: its value
- a prompt: whatever's typed. `onEnter` runs for input that matches none of its `commands`,
  so a prompt can take a name or a password:

```json
{ "type": "prompt", "prompt": "NAME: ", "variable": "name", "onEnter": { "screen": "welcome" } }
```

**Conditions.** `if` tests variables: a value (`{ "keycard": true }`), or `atLeast`, `atMost`
and `equals` (`{ "power": { "atLeast": 90 } }`). Name several variables and all must pass;
combine conditions with `{ "all": […] }`, `{ "any": […] }` and `{ "not": … }`. Text is compared
ignoring case and outer spaces. `if` goes on:
- **elements**: shown only if it holds when the screen starts
- **`next` rules** and **prompt commands**: only active while it holds
- **actions**: an action can be a list, and the first whose `if` holds runs. A last entry
  without `if` is the "else":

```json
"action": [
    { "if": { "keycard": true }, "screen": "vault" },
    { "dialog": "locked" }
]
```

**In text.** `{name}` in text, links, toggles, prompts and dialogs shows a variable's value, and
updates as it changes. Braces around anything that isn't a declared variable are left alone.

Every variable is checked when the program loads: an undeclared name, a type mismatch (like
`{ "keycard": 1 }` for a true/false variable), or a toggle bound to the wrong kind of variable
is an error, with its location.

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

### Waiting for the reveal
By default, each link, toggle, slider, section and prompt works as soon as it has been revealed,
while the rest of the screen may still be typing. Set `"waitForReveal": true` in the config
(or on a screen) and they all stay locked until the whole screen has revealed, then unlock
together, as on a real terminal. A tap still finishes the reveal at once. An expanded
section's contents wait for their own reveal in the same way.

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
  copy the result into your program's `config` as `sound.voices`, e.g.
  `"sound": { "voices": { "key": { "pitch": 2400 } } }`. Only the settings you change are written.
- **Custom** designs brand new sound effects: roll a preset (laser, explosion, pickup, blip…),
  adjust it, and copy it as JSON. Its synthesizer is a port of [jsfxr](https://github.com/chr15m/jsfxr)
  (public domain), the JavaScript version of DrPetter's classic sfxr.

Edits on both tabs are kept in the browser.

### Your own sounds
A program can define sound effects in a top-level `sounds` library, and play them by name:

```json
"sounds": {
    "door": { "wave": "noise", "sustain": 0.26, "punch": 0.49, "decay": 0.04, "frequency": 0.1 }
},
"screens": {
    "hatch": {
        "sound": "door",
        "content": [
            { "type": "text", "text": "WARNING", "sound": "alarm" },
            { "type": "link", "text": "> OPEN", "action": { "screen": "airlock", "sound": "door" } }
        ]
    }
}
```

`"sound"` works on actions (so on links, prompt commands, `next` rules, slider rules, progress
bar outcomes and dialog buttons), on elements (as they start to appear), on screens (as they
appear) and on dialogs (instead of the usual beep). A sound named `key`, `select`, `tick`, `error`,
`dialog` or `alert` replaces Teletronix's own sound of that kind. Design sounds on the sound test
page's **Custom** tab. Every sound name is checked when the program loads.

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

## At the table
### Kiosk mode
Add `&kiosk` to a program's address (e.g. `?data=ypsilon14&kiosk`) to run it on a dedicated
screen:
- It shows the program's name and `PRESS ANY KEY`, and starts at the first key press or tap.
  Browsers only allow full screen and sound after one.
- It goes full screen, and back to full screen at the next key press or tap if the player
  leaves it (e.g. with <esc>). Some browsers, such as Safari on iPhone, have no full screen
  for web pages; install the app instead (see [Offline](#offline)).
- It keeps the screen from sleeping, hides the mouse pointer when it's still, blocks text
  selection and zooming, and asks before the page is closed or left.
- **Ctrl+Alt+R** restarts the program from its start screen, with variables reset.

### Offline
Once Teletronix has been opened, it works without a network: the app, its fonts, and every
program in `public/data` (with its images) are kept on the device. It can also be installed as
an app ("Install" in Chrome and Edge, "Add to Home Screen" on iPhone and iPad), which opens full
screen, without the browser around it, at the last program played on that device.

A new version installs in the background and takes over the next time Teletronix is opened
after all its tabs and windows have closed, so it never interrupts a session. Offline caching
only runs in a build (`npm run build`, `npm run preview`), not the dev server.

The icon is drawn in `public/icons/icon.svg`; after changing it, run `node scripts/icons.ts`
to render the PNG sizes.

## Tests
Two suites, both run on every push by GitHub Actions:

- **Unit tests** (`npm test`, Vitest): the engine, schemas, modules' behavior and the
  generated files, with a fake clock. Next to the code, as `*.test.ts`.
- **Browser tests** (`npm run test:e2e`, Playwright): the player, the settings page and the
  sound test page, driven as a user would, in Chromium, Firefox and WebKit. In `e2e/`, one
  file per feature. They build the app and serve it on port 4173, so a running dev server
  doesn't matter.

The first time, install the browsers with `npx playwright install`. Then:

```sh
npm run test:e2e                         # everything
npx playwright test e2e/dialogs.spec.ts  # one file
npx playwright test --project=webkit     # one browser
npm run test:e2e:ui                      # step through tests, with a live view
npx playwright show-report               # after a failure: traces of what happened
```

Browser tests write their own small programs (see `e2e/fixtures.ts`) rather than relying
on the demos, and turn reveals and transitions off (reduced motion) unless the test is
about them. The shipped programs are covered by a crawl that follows every link in them.
Every new feature gets tests.

## Layout
- `src/engine/`: framework-free TypeScript (schema, state machine, navigation, timing, text
  reveals). It can't import React or use the DOM; Biome and the engine's tsconfig enforce this.
- `src/modules/<name>/`: one folder per element type. `definition.ts` holds the schema and
  engine behavior; `View.tsx` holds the React view.
- `src/effects/<name>/`: one folder per visual effect, split the same way as modules.
- `src/ui/`: the React layer. Per-frame text is written straight to the DOM, so React only
  re-renders on structural changes.
