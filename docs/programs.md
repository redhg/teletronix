# Writing a program

Point `$schema` at `schema/teletronix.schema.json` for validation and autocomplete in your
editor. Invalid programs show their errors in the browser instead of running.

These pages are a tour. **[The reference](reference.md)** lists every property, with its type
and default; it's generated from the schema, so it's always current.

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

## Moving on without a link
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

## Variables and conditions
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

**Randomness.** `{ "random": [1, 20] }` sets a number variable to a whole number from the first
to the second, like a dice roll; `{ "pick": ["RAIN", "FOG"] }` sets a variable to one of a list.
An action's `screen` (or `dialog`) can be a list, to go to one of them at random:
`{ "screen": ["ambush", "quiet-corridor", "quiet-corridor"] }` (listing one twice makes it twice
as likely). And a text element with `"pick": [ ... ]` shows one of its lines, chosen each time
its screen is shown.

```json
{ "type": "link", "text": "> ROLL", "action": { "set": { "roll": { "random": [1, 20] } } } }
```

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

## Timers
`config.timers` declares clocks that keep running from screen to screen, such as a
self-destruct countdown:

```json
"timers": { "destruct": { "from": 300, "onComplete": { "screen": "boom" } } }
```

- A timer counts from `from` to `to` in seconds (`to` defaults to 0: a countdown; set it
  higher than `from` to count up). `format` is `"mm:ss"` (the default), `"hh:mm:ss"` or `"ss"`.
- Actions control it: `"startTimer": "destruct"` (carries on if it was stopped partway, starts
  over if it had finished), `"stopTimer"` and `"resetTimer"`. `"autostart": true` starts it
  with the program.
- `{destruct}` shows it in text, dialogs and bars, updating every second, and conditions test
  it as its seconds: `{ "destruct": { "atMost": 30 } }`.
- When it gets to `to`, its `onComplete` runs on whatever screen the player is on.

A `"timer"` element shows a clock on the screen, after its `label`: a program timer
(`"timer": "destruct"`), or a timer of its own, set up with `from`, `to`, `format` and
`onComplete`, which starts once it's revealed and stops when the player leaves the screen:

```json
{ "type": "timer", "label": "AIRLOCK CYCLE: ", "from": 10, "onComplete": { "dialog": "cycled" } }
```

With `"big": true`, the time is drawn in big block digits, five lines tall, under the label
(where they fit across the screen; otherwise it's ordinary text).

For a warning that must be seen, the `blink` class makes text blink (it holds still with reduced
motion): `"className": "alert blink"`.

## Dialogs
`dialogs` holds modal dialogs, opened by any `{ "dialog": "<id>" }` action:
- `"alert"`: a message with one button (`dismiss`, default `"OK"`). Closes with <enter>, <esc> or a click.
- `"confirm"`: a question. `confirm` (<enter>) and `cancel` (<esc>, or a click outside) each have
  a button `text` and an optional `action`.

## Reveals and transitions
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

## Keys
Wherever the program doesn't use them for anything else:
- **Esc** finishes revealing the screen at once, like a click (stopping at a `pause`, as a
  click does). `"skipKeys"` in the config changes which keys do this, e.g. `["Space"]`, or
  `[]` for none.
- **Ctrl+M** mutes or unmutes the sound.

A key the program uses comes first: a dialog, a focused control, a pause, a progress bar's
abort key, a button's hotkey, or a screen's `next` rule.

## Waiting for the reveal
By default, each link, toggle, slider, section and prompt works as soon as it has been revealed,
while the rest of the screen may still be typing. Set `"waitForReveal": true` in the config
(or on a screen) and they all stay locked until the whole screen has revealed, then unlock
together, as on a real terminal. While the reveal waits at a [pause](elements.md#pauses), those revealed so
far work. A tap still finishes the reveal at once. An expanded
section's contents wait for their own reveal in the same way.

## Autoscroll
When a screen is taller than the window, the view scrolls to keep the newest content in view:
the typing cursor, or the element being revealed. Scrolling up to reread stops it; scrolling
back down picks it up again. Each new screen starts at the top. `"autoscroll": false` turns it
off, in `config` for the whole program or on a screen.

## Saving progress
`"save": true` in `config` saves the player's progress in the browser as they go: the screen
they're on, the variables, the program's timers, and what every element remembers (open
sections, choices, a login's tries, a shell's folder). Opening the program again carries on
from there, so a session survives a reload, or picks up next week on the same computer. A
`{ "restart": true }` action starts over, e.g. from a "> NEW GAME" link. Each program saves
under its `name`; the editor's preview never saves.

## Right-click menu
The browser's right-click menu is blocked, so a program feels like a terminal rather than a web
page; the prompt's text field keeps its menu, for pasting. `"blockContextMenu": false` in `config`
brings it back.
