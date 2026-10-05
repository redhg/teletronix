# Look and sound

## Appearance
`config.theme` sets the colors: `"default"` (pale blue on black), `"amber"`, `"green"`, `"white"`, or your
own, e.g. `{ "fg": "#33ff66", "bg": "#001100" }`. `config.font` picks a typeface: `"departure-mono"`
(the default), `"ast-premiumexec"`, `"ibm-vga"`, `"ibm-ega"`, `"ibm-cga"`, `"ibm-cga-thin"`,
`"ibm-mda"` or `"toshiba-satellite"`. Text is sized to whole multiples of the font's pixel
height, so it stays crisp. Or a font installed on the player's computer: `"courier-new"`,
`"consolas"` (Windows) or `"menlo"` (macOS). These aren't bundled, so where one isn't
installed, the browser's own monospace font stands in; they can be any size.

`config.fontScale` makes text bigger or smaller, from 0.5 to 2 (default 0.75). It scales the
usual size, which already adapts to the window, so text stays in proportion on a phone and a
big monitor. Pixel fonts still snap to whole multiples of their pixels, so they grow in steps.
Text is never smaller than 16px, so it stays readable on a phone; there, a pixel font snaps to
the screen's own (smaller) pixels, so it's crisp at more sizes.

`config.lineSpacing` sets how far apart lines are, as a multiple of the text's size, from 1 to 2
(default 1.25). At 1, lines touch, as on the original machines, so block art (`█▓▒░`) and box
drawing join up from line to line. (Maps and big timer digits always join up.)

The easiest way to choose is the [editor](editor.md#the-editor)'s **Appearance** section: change the
theme, font and effects and watch the program update beside you.

## Sound
Teletronix makes its own retro sound effects as it runs, with no audio files: key clicks as text
types, digital crackle for glitches, hiss for static, and beeps for links, toggles, sliders, prompts
and dialogs. An optional CRT hum (`"hum": true`) adds a mains hum and a faint high whine.

Sound is on by default, quietly. `config.sound` turns it off (`false`) or adjusts it:
`{ "volume": 0.5, "typing": false, "hum": true }`. Browsers only play sound once the player has
clicked or pressed a key, so it starts then. Players can mute it with the toggle in the corner,
`[♪]` (`[♪×]` while muted), or with Ctrl+M, and their choice is remembered. The toggle can go in a
[bar](elements.md#header-and-status-bars) instead, with `{ "soundToggle": true }`: the corner's goes while
that bar shows. `"button": false` leaves the corner's out altogether; Ctrl+M still works.

The [editor](editor.md#the-editor)'s **Sounds** section has two tabs:
- **Teletronix's own** tunes the built-in sounds: play each one and adjust it by ear. Only the
  settings you change are written, into `config.sound.voices`, e.g.
  `"sound": { "voices": { "key": { "pitch": 2400 } } }`.
- **The program's sounds** designs brand new sound effects for its `sounds` (below): roll a
  preset (laser, explosion, pickup, blip…) and adjust it. Its synthesizer is a port of
  [jsfxr](https://github.com/chr15m/jsfxr) (public domain), the JavaScript version of DrPetter's
  classic sfxr.

## Your own sounds
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

## Effects
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

The sample's photo of the Gulf of Mexico at night, from orbit, is by
[NASA on Unsplash](https://unsplash.com/photos/photo-of-outer-space-Q1p7bh3SHj8), under the
[Unsplash License](https://unsplash.com/license) (noted in `public/licenses/`).

The glitch effect is ported from [musicforprogramming.net](https://musicforprogramming.net).
