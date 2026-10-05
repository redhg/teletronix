# Elements
A screen's `content` is a list of elements, revealed one after another:

| Type | |
|---|---|
| `"text"` (or a bare string) | Text: a string, a list of lines, or a text file (`src`). Line breaks are kept; long lines wrap unless `"wrap": false`. |
| `"ascii"` | *Experimental:* an image turned into text, character by character. See [ASCII art](#ascii-art). |
| `"link"` | Clickable text with an `action`, and optionally a `secondaryAction` for a shift-click, right-click, Shift+Enter or long press. |
| `"menu"` | A list of `items` navigated with the arrow keys, like a BIOS menu. See below. |
| `"tree"` | Folders and items, like a file browser, opening screens (in a frame beside it, if it has one). See [Trees](#trees). |
| `"toggle"` | Text that cycles through its `states` when clicked, remembered across visits. |
| `"choice"` | One of several `options`, shown side by side like radio buttons. See below. |
| `"prompt"` | A command line. Each of its `commands` has an `action`; `onEnter` takes anything else. |
| `"shell"` | A command line over a little computer: files and folders, programs, and commands of your own. See below. |
| `"login"` | A username and a masked password, checked against its accounts, with an optional limit on wrong tries. See below. |
| `"number"` | A prompt for whole numbers only: codes, keypads, settings. See below. |
| `"bitmap"` | An image (`src`, `alt`). The screen waits for it to load. `cols` sets its width in characters (its height follows), e.g. to match a line of text. See [Image reveals](#image-reveals). |
| `"progress"` | A text progress bar that runs `from` one percentage `to` another over a `duration`. See below. |
| `"counter"` | A number that counts quickly to a target, like a memory test: "MEMORY TEST: 640K OK". See below. |
| `"checklist"` | Lines that appear one at a time, each followed after a moment by a status like `[ OK ]`. See below. |
| `"power-off"` | Switches the screen off like an old CRT: the picture collapses to a line, then a dot. See [Presets](#presets). |
| `"crash"` | Fills the window with garbage that never stops changing. See [Presets](#presets). |
| `"visual"` | Line art that moves: an oscilloscope, a chart, a radar or a turning wireframe. See below. |
| `"decrypt"` | A message that starts scrambled and resolves a few characters at a time, with an optional progress bar. See below. |
| `"hexdump"` | Bytes as a hex dump: your text, random bytes with text hidden in them, or a file. See below. |
| `"conversation"` | A conversation with a computer: it speaks, the player picks a numbered reply, and it answers. See below. |
| `"map"` | A deck plan or a star field, with markers (some following variables) and optional crosshairs to select a target. See below. |
| `"log"` | A live log: lines that keep arriving, one every so often, with optional timestamps. See below. |
| `"spinner"` | A spinner that turns for a while, or until a key, holding the screen. See below. |
| `"slider"` | A bar the player sets by dragging or with the arrow keys. See below. |
| `"meter"` | A gauge: a bar showing a variable or timer, live. See below. |
| `"table"` | Rows and columns of text, with optional box-drawn borders. See below. |
| `"section"` | A header that expands and collapses the elements under it. See below. |
| `"columns"` | Lays elements out in columns, e.g. a long list of links. See below. |
| `"carousel"` | Slides shown one at a time, flipped with ◄ PREV and NEXT ► or the arrow keys: records, photos, pages. See below. |
| `"frames"` | Panels side by side, each typing its own content at the same time, and scrolling by itself. See below. |
| `"rule"` | A horizontal rule, of any character or pattern, with an optional label set into it. See below. |
| `"breadcrumb"` | Where the player is, following screens' parents: HOME › READOUTS › SPINNERS, each step a link back. See [Breadcrumbs](#breadcrumbs). |
| `"pause"` | Stops the reveal with "-- PRESS ANY KEY TO CONTINUE --" until a key or tap. See below. |
| `"buttons"` | A row of `[ BUTTONS ]`, each with an `action` and an optional hotkey. See below. |
| `"timer"` | A clock on the screen, counting down or up. See [Timers](programs.md#timers). |

Actions are `{ "screen": "<id>" }` or `{ "dialog": "<id>" }`, and can also change variables
(see [Variables and conditions](programs.md#variables-and-conditions)). `{ "back": true }` goes back to
the screen before (and the one before that, each time), so one help screen can serve many.
`{ "restart": true }` starts the
program over, as if just loaded: the start screen, with every variable, timer and element's
memory (a locked login, an opened section) back where it began. Every element takes an optional
`className` (e.g. `"alert"`), `reveal`, and `if`.

## Inline styling
Part of a line can have CSS classes, anywhere text goes (text, links, choices, tables, checklists,
bars, dialogs, the shell…): `"REACTOR STATUS: [alert]CRITICAL[/alert]"`. Close with `[/alert]`
or just `[/]`; give several classes with spaces, `[alert blink]NOW[/]`; and nest them. Only
lowercase names that are closed later count, so text like `[ OK ]`, `[FAIL]` or `[X]` is left
as it is, and `[[` is a `[` that's never markup: `[[alert]` shows as `[alert]`. The markup
takes no room: lines wrap, align and type out as if it weren't there, and screen readers don't
hear it. The built-in classes are `alert` (the alert color), `blink` and `dim` (for notes); your own need CSS.

## ASCII art
For art drawn by hand, put it in a text file and give a text element its `src`: no escaping,
and it's shown exactly as written (with `"wrap": false`, and `align` to place it). Like any
text, it reveals with the screen's reveal: typed out, glitched in.

```json
{ "type": "text", "src": "data/art/satellite.txt", "wrap": false, "align": "center" }
```

**Experimental, a work in progress:** an `"ascii"` element turns an image into text instead.
Its results aren't good enough yet (so the sample doesn't show it), and its options may
change. It's `cols` characters wide (default 60),
its height following the image's shape:

```json
{ "type": "ascii", "src": "data/images/logo.png", "alt": "The station's logo", "cols": 40 }
```

Each character cell of the picture gets the character whose shape best matches it (after
[Alex Harri's technique](https://alexharri.com/blog/ascii-rendering)), measured from the font
in use, so edges come out as `/`, `_`, `|` and the like. `"mode": "ramp"` picks characters by
brightness alone (` .:-=+*#%@`), which can suit soft pictures better. `contrast` (0 to 5,
default 1) sharpens edges, and `invert` draws dark parts instead of bright ones. Bold,
high-contrast pictures (logos, silhouettes, faces) work best; fine detail gets lost at a few
dozen characters across. Screen readers hear the `alt` text, not the characters. Like the
`depth` reveal, it needs to read the image's pixels, so images from other sites may not work.

## Image reveals
An image's `reveal` picks how it appears, and `duration` how long it takes:

```json
{ "type": "bitmap", "src": "data/images/orbit.jpg", "alt": "…", "reveal": { "type": "raster", "duration": 4000 } }
```

| `reveal` | | Default duration |
|---|---|---|
| `"pixelate"` | blocky to sharp (the default) | 1650 ms |
| `"raster"` | line by line from the top, with a bright scan line, like a transmission | 2500 ms |
| `"dissolve"` | in random specks | 1500 ms |
| `"depth"` | from 1-bit black and white, through 8, 64 and 512 dithered colors, to full color | 1500 ms |
| `"glitch"` | slices jumping sideways, with bars of noise, settling as it finishes | 1000 ms |
| `"instant"` | all at once | |

A bare name (`"reveal": "dissolve"`) uses its default speed. Without a `reveal`, an image
pixelates in, or appears at once on a screen that reveals instantly. A `blend` applies
throughout. `"depth"` needs to read the image's pixels, so an image from another site (without
permission to share them) pixelates instead.

## Alignment and preformatted text
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

## Progress bars
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

## Checklists and counters
```json
{ "type": "checklist", "items": ["LOADING KERNEL", { "text": "CRYO BAY 3", "status": "[FAIL]" }] },
{ "type": "counter", "label": "MEMORY TEST: ", "to": 640, "unit": "K", "done": " OK" }
```
- A checklist types each of its `items`, waits a moment (`delay`, default 300ms, varied a little
  from line to line), then fills the gap with its `leader` (default `.`) up to its `status`
  (default `[ OK ]`) at the right edge, or at `width` characters. An item can have its own
  `status` and an exact `delay`.
- A counter counts `from` (default 0) `to` its number over a `duration` (default 1500ms), in
  whole `step`s (default 1), with `unit` after the number and `done` added once it's finished.

## Visuals
```json
{ "type": "visual", "kind": "wireframe", "shape": "icosahedron", "cols": 20, "rows": 8 }
```
Line art that moves, drawn in the screen's colors (or the alert color, with `"className": "alert"`).
It's pure decoration: it goes on until the screen does, and screen readers get its `alt` instead.
It's `cols` characters wide (default: the screen's width) and `rows` lines tall (default 8), and
`speed` makes it faster or slower. Each `kind` has settings of its own:

| `kind` | |
|---|---|
| `"waveform"` | An oscilloscope trace. `wave`: `"sine"`, `"square"`, `"saw"`, `"triangle"` or `"noise"`, or a list of them added together; `frequency` (cycles across it) and `amplitude` (0 to 1). |
| `"chart"` | Telemetry scrolling past. `style`: `"line"` or `"bars"`; `volatility` (0 to 1): how wildly the values jump. |
| `"radar"` | A sweep, with `blips` that flare as it passes. |
| `"wireframe"` | A turning `shape`: `"cube"`, `"pyramid"`, `"octahedron"`, `"icosahedron"` or `"torus"`, or `"terrain"`, a landscape flying past. |

`"level": { "variable": "fuel", "min": 0, "max": 100 }` makes a visual follow a number variable
as it changes: a waveform's height, the level a chart wanders around, how many blips a radar
shows, or how fast a wireframe turns. A slider can tune an oscilloscope.

Waveforms and charts have a faint grid, unless `"grid": false`. Visuals only move while they're in
view, and with reduced motion they're still pictures. Put a few side by side with
[`"columns"`](#columns).

## Decrypting
```json
{
    "type": "decrypt",
    "text": ["PRIORITY ONE: INSURE RETURN OF ORGANISM.", "CREW EXPENDABLE."],
    "duration": 4000,
    "bar": "DECRYPTING ",
    "onComplete": { "after": 1500, "action": { "screen": "orders" } }
}
```
The `text` (a string or a list of lines) starts as scrambled characters, and each comes right at
its own moment over `duration` milliseconds (default 3000). Spaces and line breaks stay put, so
the layout never shifts.
- `charset`: what it scrambles with: `"symbols"` (the default), `"hex"`, `"binary"`, `"letters"`,
  or your own characters. `order`: `"random"` (the default), or `"sweep"`, from start to end.
- `bar` adds a progress bar under it, after that label, ending in `done` (default `COMPLETE`).
- `failAt` stops it at that percentage, leaving the rest scrambled, with `failed` (default
  `FAILED`) at the end of the bar.
- `onComplete` and `onFail` run an action (or `{ "after", "action" }`) when it finishes or fails.
- Skipping finishes it at once; so does reduced motion. Screen readers get the message itself.

## Hex dumps
```json
{ "type": "hexdump", "size": 512, "text": "SPECIAL ORDER 937", "highlight": ["937"], "offset": 49152 }
```
Bytes three ways: an address, the bytes in hex, and the same bytes as text. Only for looking at.
- The bytes are your `text` (a string or a list of lines), or `size` random bytes (the same every
  time) with your `text` hidden among them at `at` (default: two-thirds of the way in), or any
  file with `src` (the screen waits for it to load).
- `highlight` draws bytes in the alert color: some text (everywhere it appears), or
  `{ "from", "to" }`, counting bytes from 0.
- `offset` is the address shown for the first byte. `perRow` fixes the bytes per row (4, 8 or
  16; by default, as many as fit), `ascii: false` hides the text column, and `lowercase: true`
  uses lowercase hex.
- Its rows appear one after another (`speed`, in milliseconds per row, default 12). With `rows`
  (a number, or `"fill"` for as many as fit the window), it's a window instead, with a cursor the
  player moves with the arrow keys, Page Up/Down, Home and End, or by clicking a byte. `status`
  adds a status line under it, where `{offset}` is the cursor's address, `{byte}` the byte there,
  and `{size}` the number of bytes; `statusBar: true` pins that line to the bottom of the window,
across its whole width, like a status bar. `autoscroll` moves the cursor down through the bytes
by itself (`true`, or the rows per second; `true` is 4), starting again at the top unless
`"loop": false`. It stops once the player takes over with a key or a click. Shift+Up or
Shift+Down stops it too; stopped, Shift+Up scrolls up and Shift+Down scrolls down (turned back on
after stopping at a highlight, it goes on past it). With
`"stopAt": "highlight"` it stops with the cursor on the first highlighted bytes, once they're in
the top half of the window. With reduced motion, it stays put. `exit` gives it a key (default `Escape`) and an `action` to
  leave by.

The `hexeditor` [preset](#presets) is a whole screen of one, with a header bar.

## Conversations
```json
{
    "type": "conversation",
    "speaker": "MOTHER: ",
    "start": "hello",
    "nodes": {
        "hello": {
            "say": "INTERFACE 2037 READY FOR INQUIRY.",
            "replies": [
                { "text": "WHAT IS SPECIAL ORDER 937?", "next": "order", "if": { "cleared": true } },
                { "text": "EMERGENCY OVERRIDE 100375.", "next": "override", "once": true },
                { "text": "(LOG OFF)", "action": { "back": true } }
            ]
        },
        "override": { "say": "OVERRIDE ACCEPTED.", "action": { "set": { "cleared": true } }, "replies": [{ "text": "...", "next": "hello" }] },
        "order": { "say": ["PRIORITY ONE: INSURE RETURN OF ORGANISM.", "CREW EXPENDABLE."] }
    }
}
```
A conversation goes from part to part (`nodes`, by name), starting at `start`. Each part `say`s
its lines, typed out after the `speaker` (every `speed` milliseconds a character, default 25),
then runs its `action` if it has one, and offers its numbered `replies`: the player clicks one,
or presses its number. A reply goes on to its `next` part and/or runs its `action` (set a
variable, go to a screen, go `back`), and is said after `you` (default `> `). Replies with an
`if` are only offered while it holds, and `once` ones until they've been chosen (remembered when
the player comes back). A part with no replies ends the conversation. A click, Enter or Space
finishes the line being typed. Lines and replies can show variables and inline markup.

## Maps
```json
{
    "type": "map",
    "cols": 48, "rows": 12, "sectors": [12, 4],
    "cursor": true, "variable": "target", "status": "SECTOR {sector}  {target}",
    "markers": [
        { "x": "shipX", "y": "shipY", "char": "@", "label": "NOSTROMO", "blink": true },
        { "x": 33, "y": 9, "label": "LV-426", "className": "alert", "action": { "screen": "lv426" } }
    ]
}
```
A map is your own drawing (`grid`, as lines of text, e.g. a deck plan), or a star field `cols`
wide and `rows` tall, scattered with faint `stars` (the same each time). `sectors`
(`[width, height]`) divides it into sectors, lettered across the top and numbered down the side.
Its rows touch, so box drawing joins up.
- `markers` are what's on it: a `char` at `x`, `y` (counting from 0; either can be a number
  variable's name, so a marker moves as it changes), with a `label`, optional `blink` and
  `className`, an `if`, and an `action`.
- `"cursor": true` (or `{ "x", "y" }` to start somewhere) adds crosshairs, moved with the arrow
  keys (Shift: five at a time) or a click. Enter, Space or a click on a marker selects it: its
  `action` runs, and `variable` gets its label. `status` is a line under the map, where
  `{sector}`, `{x}`, `{y}` and `{target}` (the label under the crosshairs) are filled in.

## Logs
```json
{ "type": "log", "lines": ["HULL SENSOR 4: NOMINAL", "[alert]AIRLOCK 2: PRESSURE DROP[/]"], "time": "06:12", "loop": true, "rows": 6 }
```
A log's `lines` arrive one at a time while its screen is up, every `interval` milliseconds
(default 1500, varied a little each time), in order or with `"order": "random"`. With `time` (a
clock time like `"06:12"`), each line is stamped `[06:12:03]` with when it arrived. With
`"loop": true` it starts the lines again once they've all arrived, for good. `rows` keeps only
the latest lines (by default all of them, or 10 when it loops). Lines can show variables and
inline markup. It runs alongside the rest of the screen, and screen readers hear new lines.

## Spinners
```json
{
    "type": "spinner",
    "label": "DIALLING MAINFRAME ",
    "style": "dots",
    "duration": 3000,
    "countdown": true,
    "done": "CONNECTED",
    "onComplete": { "screen": "mainframe" },
    "interrupt": { "key": "Escape", "text": "ABORTED", "action": { "screen": "menu" } }
}
```
A spinner types its `label`, then turns for `duration` milliseconds, holding the rest of the
screen, like a pause that ends by itself. Then its `done` text takes the spinner's place; without
any, the line goes. Without a `duration`, it spins until the player presses a key.
- `style`: `"line"` (`| / - \`, the default), `"dots"`, `"blocks"`, `"bar"` (a bouncing `[=   ]`),
  or a list of your own frames. `speed` is the milliseconds each frame shows.
- `countdown: true` shows the seconds left after the spinner.
- `onComplete` runs an action when it finishes (or `{ "after", "action" }` to pause first).
- `interrupt` aborts it at a `key`: its `text` takes the spinner's place, and its `action` (with an
  optional `after`) runs instead of `onComplete`.
- Skipping finishes it at once. With reduced motion, it holds still but still takes its time.

## Choices
```json
{ "type": "choice", "label": "POWER: ", "options": ["ECO", "NORMAL", "OVERDRIVE"], "variable": "power" }
```
Shows every option at once, `(•) ECO  ( ) NORMAL  ( ) OVERDRIVE`, and the player picks one with
a click, or tabs to it and uses the arrow keys. It remembers the choice; with `"variable"`, it
keeps it there: the option's text in a text variable, or its index (from 0) in a number
variable. `onChange` runs when the choice changes. `markers` changes the marks, e.g.
`{ "off": "< >", "on": "<*>" }`; `gap` sets the characters between options (default 2).

With `"multiple": true`, any number of options can be ticked, like checkboxes:
`[X] LIGHTS  [ ] HEATING  [X] AIR`. A click (or <space>) ticks one on or off; `initial` lists
the options ticked at first (e.g. `[0, 2]`). Instead of one `variable`, `variables` gives each
option a true/false variable of its own, in order (`null` for an option without one), so
conditions and text can use each: `"variables": ["lights", "heat", "air"]`. A multiple choice
with a single option is a checkbox: `{ "type": "choice", "multiple": true, "options": ["AIRLOCK
SEALED"], "variables": ["sealed"] }`.

(A toggle is still the element for one line that cycles through texts, like `SHUT` → `AJAR` →
`OPEN`; a choice shows every option at once.)

## Sliders
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

## Sections
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
`seenTitle` replaces the title once the section has been opened, and stays when you come back:
an inbox's messages use it to lose their unread mark.

## Numbers
```json
{
    "type": "number",
    "prompt": "CODE: ",
    "digits": 4,
    "mask": true,
    "on": [{ "equals": 1138, "action": { "screen": "vault" } }],
    "otherwise": { "dialog": "denied" }
}
```
A prompt that only takes whole numbers: letters and symbols are ignored, and phones show their
number keypad. `digits` limits how many can be typed, and `mask` shows `*` for each. On <enter>,
the first `on` rule the number meets runs (`equals`, `atLeast`, `atMost`, or a combination),
or else `otherwise`. A number outside `min` and `max`, or one that meets no rule when there's
no `otherwise`, shows the `unknown` message. `variable` keeps the number in a number variable,
set before any action runs, so the next screen can show it as `{fuel}` or test it.

The up and down arrow keys change the number by `step` (default 1), or ten times that with Shift,
staying within `min`, `max` and `digits`. From an empty field, up starts at the lowest number and
down at the highest.

## Shells
```json
{
    "type": "shell",
    "style": "unix",
    "files": {
        "readme.txt": "Welcome aboard.",
        "logs": { "0603.log": ["0600 WOKE CREW", "0612 SIGNAL RECEIVED FROM LV-426"] },
        "mother": { "run": { "screen": "mother" } },
        "classified": { "folder": { "937.txt": "CREW EXPENDABLE." }, "if": { "cleared": true } }
    },
    "commands": [{ "command": "status", "output": ["ALL SYSTEMS NOMINAL.", "FUEL {fuel}%"] }],
    "exit": { "screen": "home" }
}
```
A command line that keeps a transcript, like a real terminal. Its `files` are a little computer:
a string (or a list of lines) is a text file, an object of names is a folder, and
`{ "run": action }` is a program, run by typing its name. `{ "file" }`, `{ "folder" }` and
`{ "run" }` can also have a `date`, an `if` (to be there only while it holds, e.g. once a
variable is set), a `password`, and a program a `size`. Reading, running or going into
something with a password (or through a folder with one) asks for it first, with
`passwordPrompt` (default `Password: `), the input shown as `*`; a wrong one gets `denied`
(default `Access denied.`), and once it's given, it stays open.
- `"style": "unix"` (the default) knows `help`, `ls`, `cd`, `cat`, `pwd` and `clear`, at a
  `user@teletronix:/logs$ ` prompt; `"dos"` knows `HELP`, `DIR`, `CD`, `TYPE` and `CLS`, at
  `C:\LOGS>`, and runs `MOTHER.EXE` as `MOTHER`. Names and paths ignore case.
- `commands` are your own (first, before the built-in ones): each prints its `output` (which
  can show variables) and/or runs its `action`, and can have an `if`. `exit` makes `exit` a
  command, with that action.
- `prompt` changes the prompt (`{cwd}` is the folder it's in), and `unknown` what it says to a
  command it doesn't know (`{command}` is what was typed).
- The up and down arrow keys bring back earlier commands, and Tab completes command and file
  names. It remembers its folder and those commands when the player comes back; its transcript
  starts afresh.

## Logins
```json
{
    "type": "login",
    "accounts": [{ "user": "ripley", "password": "JONESY" }, { "user": "ash", "password": "937", "action": { "screen": "science" } }],
    "action": { "screen": "inside" },
    "attempts": 3,
    "onLocked": { "screen": "lockout" },
    "granted": "ACCESS GRANTED.",
    "variable": "name"
}
```
Asks for a username, then a password (shown as `*`), and checks them against its `accounts`:
usernames in any case, passwords exactly. The right ones run the account's `action`, or the
login's; `granted` shows first, for `after` milliseconds (default 1000). `variable` keeps the
username in a text variable. `"username": false` asks for a password only.

A wrong try shows `denied` and starts again. With `attempts`, it also says how many tries are
left (`remaining`, where `{n}` is the number), and the last wrong one locks the terminal: it
shows `locked` and runs `onLocked`, and stays locked when the player comes back. The prompts and
messages can all be changed.

## Menus
```json
{
    "type": "menu",
    "items": [
        { "text": "1. RUN DIAGNOSTICS", "key": "1", "action": { "dialog": "diagnostics" } },
        { "text": "2. SHUT DOWN", "key": "2", "action": { "screen": "shutdown" } }
    ]
}
```
A list of items, one per line. The highlighted item is drawn in inverse, with `marker`
(default `>`) before it. <up>/<down> (and <home>/<end>) move the highlight, as does the mouse,
and <enter> or a click chooses it; an item's `key` chooses it from anywhere on the screen. The
menu takes the keyboard once it can be used, and remembers the highlighted item when you come
back. Items can have a `secondaryAction` and a `className`, like links.

## Buttons
```json
{
    "type": "buttons",
    "align": "center",
    "buttons": [
        { "text": "LAUNCH", "key": "l", "action": { "screen": "launch" } },
        { "text": "ABORT", "key": "a", "className": "alert", "action": { "screen": "menu" } }
    ]
}
```
A row of buttons, drawn as `[ LAUNCH ]  [ ABORT ]`, each only as wide as its label (`gap`
sets the columns between them, default 2). They're pressed with a click, <enter>, or their
`key` from anywhere on the screen; a letter key is underlined in the label. The arrow keys move
along the row. Like links, a button can have a `secondaryAction`. A row too wide for the
screen wraps between buttons.

## Columns
```json
{
    "type": "columns",
    "count": 3,
    "minWidth": 16,
    "content": [
        { "type": "link", "text": "> AUTOSCROLL", "action": { "screen": "autoscroll" } },
        { "type": "link", "text": "> BARS", "action": { "screen": "bars" } }
    ]
}
```
Lays its `content` out in `count` equal columns on the character grid, with `gap` characters
between them (default 2); each item wraps to its column's width. Items fill each column in
turn, like a directory listing, so a sorted list reads top to bottom; `"order": "across"`
fills each row instead. With `minWidth` (in characters), a narrow screen gets fewer columns,
e.g. 3 on a monitor and 2 on a phone. The contents reveal in order, before the rest of the
screen.

## Carousels
```json
{ "type": "carousel", "slides": [
    [{ "type": "bitmap", "src": "crew/dallas.png", "cols": 30 }, "DALLAS, A. // CAPTAIN"],
    [{ "type": "bitmap", "src": "crew/ripley.png", "cols": 30 }, "RIPLEY, E. // WARRANT OFFICER"]
] }
```
Shows its `slides` one at a time, each a list of elements like a screen's content (images, text,
tables, links…), revealed as it comes into view. Under it, a line of controls: `prev` (default
`◄ PREV`), a `counter` (default `"{slide}/{slides}"`, or `false` for none) and `next` (default
`NEXT ►`). The ← and → keys flip it too, unless a field, a slider or another control that uses
them has the keyboard; with several carousels on a screen, they go to the one last used.

`align` (`"left"`, `"center"` or `"right"`) places its slides' contents, images included; an
element's own `align` still wins. It stops at the ends, or goes round with `"loop": true`. `start` picks the first slide (from 1),
and `autoplay` moves on by itself, this many milliseconds after each slide has revealed, until
the player flips a slide. It remembers which slide was showing when you come back; with a
`variable`, that number variable holds it (from 1), so the story can use it, and setting it
flips the carousel. It keeps the height of the tallest slide shown so far, so flipping back
doesn't move the rest of the screen.

## Frames
```json
{ "type": "frames", "frames": [
    { "title": "SYSTEM LOG", "rows": 9, "content": ["STATION LOG, DAY 38.", "..."] },
    { "title": "CREW", "rows": 9, "width": 26, "content": [ ... ] }
] }
```
Panels side by side, each `rows` lines tall (default 10), in a box-drawn border with its `title`
set into the top (or `"border": false`). They all reveal at once, each with its own cursor, and
the screen carries on once they've all finished; skipping finishes them all. A frame can hold
anything a screen can (links, tables, meters, a log feed…) except a pause, since that would hold
only one of them: put it after the frames.

Each scrolls by itself: it follows its text as it types in (unless `"autoscroll": false`) until
the player scrolls it back, and follows again from the bottom. ▲ and ▼ in its border show
there's more above or below. The mouse wheel or a finger scrolls it, and so do the keys once
it has the keyboard (click it, or tab to it).

A frame's `width` is in characters, border included; frames without one share what's left,
`gap` characters apart (default 1). On a screen where a frame would be narrower than `minWidth`
(default 20), they stack, each the whole width.

#### Showing screens in a frame
```json
{ "type": "frames", "frames": [
    { "title": "CREW", "width": 22, "content": [
        { "type": "link", "text": "> RIPLEY", "action": { "frame": "record", "screen": "rec-ripley" } }
    ] },
    { "title": "RECORD", "name": "record", "screen": "rec-dallas" }
] }
```
A frame with a `name` can show other screens. An action with `"frame"` and a `"screen"` reveals
that screen's content in the frame, in place of what was there, without leaving the screen it's
on: a menu on one side and records on the other. Links in the screen shown can do the same,
e.g. a record linking to the next. A frame's `screen` is what it shows to begin with (in place
of its `content`), and it remembers what it's showing when you come back. On a screen without
that frame (e.g. a record opened by itself), the action just goes to the screen.

## Trees
```json
{ "type": "tree", "frame": "record", "items": [
    { "text": "CREW", "open": true, "items": [
        { "text": "DALLAS", "screen": "rec-dallas" },
        { "text": "RIPLEY", "screen": "rec-ripley" }
    ] },
    { "text": "ORDERS", "items": [{ "text": "ORDER 937", "screen": "order-937" }] }
] }
```
```
[-] CREW
 ├─ DALLAS ◄
 └─ RIPLEY
[+] ORDERS
```
Folders and items, drawn like a file browser. An item with `items` is a folder: it opens and
closes (`"open": true` starts it open), and the tree remembers which are open. Any other item
opens its `screen`, or runs its `action`. With `frame` (a frame's name), screens open in that
frame, and the item showing there is marked (`current`, default `" ◄"`); when a link in the
frame shows another of its screens, the mark follows, opening its folders. Without `frame`,
items go to their screens.

Once it's usable it takes the keyboard: <up> and <down> move, <right> opens a folder (or steps
into it), <left> closes it (or steps out), and <enter> or <space> opens the item. A click does
the same. `markers` changes the folders' `[+]` and `[-]`, e.g. `{ "closed": "▶", "open": "▼" }`.

## Rules
```json
{ "type": "rule", "char": "═", "label": "CREW MANIFEST", "labelAlign": "left" }
```
A line across the screen (or the section or column it's in), drawn with `char`: a character
(default `─`) or a pattern repeated along it, e.g. `"-="`. It always fits the width, redrawing
when the window changes, or `cols` makes it narrower. A `label` is set into it: in the middle,
or `"labelAlign": "left"` or `"right"`, with `padding` spaces either side (default 1); a label
that doesn't fit is cut short with `~`. `ends` puts characters at each end, e.g. `["├", "┤"]`
to join a box, or `["<", ">"]`. Screen readers get the label, if any.

## Pauses
```json
{ "type": "pause", "text": "[ MORE ]", "align": "center" }
```
A pause stops the screen's reveal and shows its `text` (default
`-- PRESS ANY KEY TO CONTINUE --`) until the player presses a key or taps. Then the line goes and
the reveal carries on, so a long screen can be read a page at a time. Skipping stops at each
pause too. A pause inside an open section holds the whole screen.

With `"button": true`, the pause is a button (default text `[ CONTINUE ]`): only clicking it, or
Enter or Space while it has the keyboard, carries on, not any key or a tap anywhere. It takes the
keyboard when it appears. Use it where the player might press keys for something else meanwhile,
e.g. flipping a carousel above it.

## Presets
A preset is a ready-made screen, set up with a few settings instead of content:
```json
"boot": { "preset": { "type": "boot", "title": "ACME OS v2", "pause": true, "next": "home" } },
"halt": { "preset": { "type": "error", "message": "CORE BREACH DETECTED.", "next": "boot" } }
```
Every line of text has a default and can be changed, or left out with `false`. A preset becomes
ordinary content (with anything in the screen's own `content` after it), so anything it does can
also be written out by hand. See [the reference](reference.md#presets) for every setting.

| Preset | |
|---|---|
| `"boot"` | A `title` and `copyright` line, a `memory` test (a counter), a checklist of `checks`, and a `ready` line, then on to `next` after `after` milliseconds. With `"pause": true` (or the text to show) it waits for a key press first: browsers only play sound once the player has pressed a key or clicked, so the screen after it can start with sound. |
| `"shutdown"` | A `title`, a checklist of `checks`, and a `message`, then the screen switches off like an old CRT (unless `"powerOff": false`) `after` a moment. A key press (or a tap) switches back on, going to `next` (default: the start screen); `"restart": false` stays off for good. |
| `"error"` | A `title`, `message` and `code` in a blinking box, in the alert color, like an Amiga's Guru Meditation. A key press (or a tap) goes to `next` (default: the start screen); `"restart": false` stays for good. |
| `"login"` | A login screen: a warning `title` in the alert color, then a [login](#logins) with its `accounts` that goes to `next` (default: the start screen), showing `granted` first. With `attempts`, too many wrong tries go to the `lockout` screen. It takes the login's other settings too. |
| `"decrypt"` | A message [decrypting](#decrypting): a `title`, then the `text` with a progress `bar` (its label, or `false` for none), going on to `next` after `after` milliseconds. With `failAt`, it fails partway, going to `failNext`. It takes the decrypt element's other settings too. |
| `"countdown"` | A self-destruct sequence: a blinking warning `title` and a `message`, then the time counting down from `seconds` in big digits (unless `"big": false`), going to `next` at zero. With a `code`, the player can type it at a `prompt` to abort, going to `aborted`; a wrong one shows `wrong`. |
| `"transmission"` | A message coming in: a `title`, a spinner while the signal locks on (`acquire`, or `false`), an optional `from` line, then the `text` typing in slowly (`speed`, in milliseconds per character) through static and flicker (unless `"noise": false`), and a `signoff`. Like boot, it can `pause` and go on to `next`. |
| `"modem"` | Dialling in: the `init` command answered `ok`, the `dial` command, a `dialing` spinner, a `carrier` line that glitches in with a crackle (over `handshake` milliseconds), and `connect`, then the screen's own `content`, e.g. a bulletin board's welcome. Each step can be changed or left out with `false`. Like boot, it can `pause` and go on to `next`. |
| `"inbox"` | An inbox: a `title`, column headings (`labels`, or `false`), then the `messages` (`from`, `subject`, `date`, `body`, and `unread`, marked with `*`), each a [section](#sections) that opens to show its body, and loses its unread mark once read. The screen's own `content` (e.g. a link back) goes after it. |
| `"directory"` | A directory listing of `entries` (`name`, `size`, `date`, `dir` for folders), DOS style (`"style": "dos"`, the default: the `volume` and `path`, `<DIR>`, and a `total` of files and bytes) or Unix style (`"unix"`: `ls -l`, with permissions). Entries with an `action` are links, e.g. to a text file's screen or a hex editor. |
| `"shell"` | A [shell](#shells) under a start-up `banner` (or `false` for none), where `exit` goes to `next` (default: the start screen). It takes the shell's other settings: `style`, `files`, `commands`, `prompt` and `unknown`. |
| `"hexeditor"` | A read-only hex editor: a [hex dump](#hex-dumps) filling the screen, with a cursor to move through it, a status bar (in place of the program's), and a header bar with the editor's `title` and the `file` name. Give it bytes as a hex dump (`text`, `size`, `src`, `highlight`…), and `autoscroll` (with `stopAt`) to have it scroll through them by itself. <esc>, or the `exit` link in the header bar, goes to `next` (default: the start screen). |
| `"crash"` | The whole window fills with garbage that never stops changing: the screen before breaks apart, and a `message` surfaces through the noise now and then. With `next`, a key press (or a tap) restarts there. With reduced motion, it's a still picture. |

They're made of elements you can use on any screen, too: `"checklist"` and `"counter"` (see
above), `"power-off"` (switches the screen off, after an optional `delay`, over a `duration`), and
`"crash"`. The error's box is the `error-box` class, which any element can use (e.g.
`"className": "alert error-box"`).

## Header and status bars
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
`{ "soundToggle": true }` puts the [sound](look-and-sound.md#sound) toggle in a bar, in place of the one in the
corner. A line with `"className": "plain"` uses the screen's own colors instead, e.g. a subtitle
under an inverse title line. A screen can set its own `header`/`footer`, or `false` to hide one.

## Breadcrumbs
```json
"screens": {
    "home": { "content": [ ... ] },
    "readouts": { "title": "READOUTS & DIALS", "parent": "home", "content": [ ... ] },
    "spinners": { "parent": "readouts", "content": [ ... ] }
},
"config": { "header": [{ "left": { "breadcrumb": true }, "right": "SHIP" }] }
```
A breadcrumb shows where the player is: `HOME › READOUTS & DIALS › SPINNERS`. It follows each
screen's `parent` up to a screen without one, naming each by its `title` (default: its id, in
capitals). Every step but the last is a link back to its screen. A screen's place doesn't
depend on how the player got there, so a screen reached from several menus has one parent.

`{ "breadcrumb": true }` in a bar puts one there, with an optional `separator` (default `" › "`).
It fits in the room the rest of the line leaves, losing steps from the left (`… › NOISE ›
RESTORED`) when it's too long. `{ "type": "breadcrumb" }` puts one on a screen, as an element.

## Meters
```json
{ "type": "meter", "label": "O2 ", "variable": "oxygen", "unit": "%",
  "on": [{ "atMost": 20, "className": "alert" }] }
```
A meter draws a number variable, or a timer's seconds, as a bar like a slider's, and moves
whenever the value changes: an action's `set`, a slider bound to the same variable, a timer
running down. `min` and `max` (default 0 and 100) are the empty and full ends; `step`
(default 1) is how precisely the value is shown. Each `on` range adds its `className` while
the value is in it. `width`, `fill`, `empty` and `showValue` shape it like a slider. Unlike a
progress bar, it doesn't hold up the screen or ever finish: it's a display.

## Tables
```json
{
    "type": "table",
    "border": "box",
    "columns": [{ "title": "CARGO" }, { "title": "QTY", "align": "right" }],
    "rows": [["MINING EQUIPMENT", 12], ["MEDICAL SUPPLIES", 3]]
}
```
Each column is as wide as its widest cell (or its own `width`, cutting longer cells short),
and `align`s its cells left, right or center. Titles in `columns` make a header row. With
`"border": "none"` (the default), columns are `gap` characters apart and the header is
underlined; `"box"` draws box-drawing lines around every cell. Cells can show variables. A
table is never wrapped; one too wide for the screen is cut off at the right edge. The
element's own `align` places the whole table, e.g. centered.
