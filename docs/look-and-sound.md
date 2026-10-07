# Look and sound

## Appearance
`config.theme` sets the colors: `"default"` (pale blue on black), `"amber"`, `"green"`, `"white"`, or your
own, e.g. `{ "fg": "#33ff66", "bg": "#001100" }`. Some themes are a whole look, with a font and
effects of their own:

| Theme | Looks like | Font | Effects |
|---|---|---|---|
| `"vcr"` | A VCR's on-screen menu: white on blue, with a dark drop shadow | Home Video | A little static, faint scanlines |
| `"lcd"` | An LCD's dark segments on grey-green glass, in capitals | Digit Tech | None |
| `"paper"` | Typed on cream paper | X Typewriter | A soft vignette |
| `"printout"` | Printed by a dot-matrix printer, on green-bar paper with sprocket holes |
| `"contrast-dark"`, `"contrast-light"` | High contrast for legibility: white on black, or black on white, no glow | The device's own monospace | All off | MatrixType | None |

The program's own `font` and `effects` win over the theme's: `"theme": "vcr", "font": "ibm-vga"`
is the VCR's blue in IBM VGA. A theme of your own can choose how text casts its `shadow`
(`"glow"`, a CRT's, the default; `"drop"`, `"lcd"`, `"ink"` or `"none"`), and show it all in
`capitals`, and have `stripes`, bands of a color behind every other three lines that scroll with
the text, and `sprockets`, holes down both sides like fanfold paper's (left out on narrow screens):
`{ "fg": "#222222", "bg": "#eeeeee", "shadow": "ink", "stripes": "#dcead6", "sprockets": true }`.

`config.font` picks a typeface (the default is the theme's, or `"departure-mono"`): a period PC
font, `"ast-premiumexec"`, `"ibm-vga"`, `"ibm-ega"`, `"ibm-cga"`, `"ibm-cga-thin"`, `"ibm-mda"` or
`"toshiba-satellite"`; a VCR's, `"home-video"`; an LCD's segments, `"digit-tech"`; a dot-matrix
printer's, `"matrixtype"`; or a typewriter's, `"x-typewriter"`; or the clearest at hand, the device's own monospace font,
`"system-mono"` (Menlo on a Mac, Consolas on Windows). Pixel fonts are sized to whole
multiples of their pixel height, so they stay crisp. Or a font installed on the player's
computer: `"courier-new"`, `"consolas"` (Windows) or `"menlo"` (macOS). These aren't bundled, so
where one isn't installed, the browser's own monospace font stands in; they can be any size.

Home Video, Digit Tech, MatrixType and X Typewriter don't have the box lines, blocks, shades and
arrows Teletronix draws tables, bars, maps and frames with (nor, in X Typewriter, `< > [ ] ^ { }`),
so each comes with a font of just those, drawn to its measure: the lines meet the next
character's, in its weight, and in MatrixType, in dots. They're by
[GGBotNet](https://ggbot.net): Home Video, Digit Tech and MatrixType are CC0 (public domain),
and X Typewriter is under the SIL Open Font License (see `public/licenses/`).

`config.fontScale` makes text bigger or smaller, from 0.5 to 2 (default 0.75). It scales the
usual size, which already adapts to the window, so text stays in proportion on a phone and a
big monitor. Pixel fonts still snap to whole multiples of their pixels, so they grow in steps.
Text is never smaller than 16px, so it stays readable on a phone; there, a pixel font snaps to
the screen's own (smaller) pixels, so it's crisp at more sizes.

`config.pointer` sets the mouse pointer: `"system"`, the browser's own (the default); `"theme"`,
a pixel-art arrow (and a hand over what can be clicked) in the theme's colors; `"block"`, a
character cell in inverse video that jumps from cell to cell, as a mouse did in DOS; `"crosshair"`,
lines across the whole screen; `"hidden"`; or an image of your own, with the pixel that points,
`{ "src": "data/pointers/claw.png", "x": 2, "y": 1 }` (a PNG, 32×32 pixels or so: bigger ones may be
ignored). A screen can have its own, e.g. a crosshair on a targeting screen, as the sample's star
map does. Clicks go through as usual. Touch screens have no pointer, so it's left out there, and
players can switch back to their own in [quick settings](at-the-table.md#players-own-settings).

The page's scrollbar takes the theme's colors too (in browsers that can color it: not older
Safari), but stays the browser's own, so it scrolls as usual with touch, wheel and keys.

`config.characters` shows some characters as others, e.g. `{ "<": "(", "█": "#" }`: for a font
that lacks a character, or just for the look. One character always stands in for one, so text
keeps its shape. Only what's shown changes: commands, conditions and what players type are
matched as written, and screen readers read it as written.

`config.lineSpacing` sets how far apart lines are, as a multiple of the text's size, from 1 to 2
(default 1.25). At 1, lines touch, as on the original machines, so block art (`█▓▒░`) and box
drawing join up from line to line. (Maps and big timer digits always join up.)

The easiest way to choose is the [editor](editor.md#the-editor)'s **Appearance** section: change the
theme, font and effects and watch the program update beside you.

## Sound
Teletronix makes its own retro sound effects as it runs, with no audio files: key clicks as text
types, digital crackle for glitches, hiss for static, and beeps for links, toggles, sliders, prompts
and dialogs. An optional CRT hum (`"hum": true`) adds a mains hum and a faint high whine. A
program can add [audio files](#audio-files-and-ambience) of its own, e.g. a drone looping in the
background (`"ambience": false` turns that off).

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
`dialog` or `alert` replaces Teletronix's own sound of that kind. Design sounds in the editor
(**Sounds**). Every sound name is checked when the program loads.

## Audio files and ambience
A sound can be an audio file instead (MP3, OGG, WAV or M4A): put it in `public/data/audio/`, and
name it in `sounds` with `src`, relative to the page, and how loud it plays (`volume`, from 0 to 1,
under the overall volume; 1 by default):

```json
"config": { "name": "Nostromo", "ambience": "engines" },
"sounds": {
    "engines": { "src": "data/audio/engines.mp3", "volume": 0.6 },
    "klaxon": { "src": "data/audio/klaxon.mp3" }
},
"screens": {
    "bridge": { "content": ["…"] },
    "airlock": { "ambience": false, "content": ["…"] },
    "reactor": { "ambience": "klaxon", "content": ["…"] }
}
```

It plays wherever a sound can, once, like any other. As **ambience**, it loops in the background:
`config.ambience` under every screen, unless a screen has its own `ambience`, or `false` for
silence there. One fades into the next as screens change (over a second and a half), and a screen
with the same ambience carries on without a break. The GM can change it, or silence it, from the
[remote control](at-the-table.md#gm-remote-control). Players' sound settings apply: the volume,
muting, and `"ambience": false` in `config.sound` to turn ambience off.

Files are loaded as the program needs them and kept, and the [offline](at-the-table.md#offline)
copy includes them. A file loops seamlessly if it was made to: WAV and OGG loop exactly; an MP3
can have a few milliseconds of silence at each end, from how it's encoded.

The sample's drone is ["DSGNDron_Mysterious Resonant Industrial Sci-fi Drone 3_EM" by
newlocknew](https://freesound.org/s/749636/), under
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): free to share and adapt with
credit, but not for commercial use (see `public/licenses/sci-fi-drone.txt`).

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
