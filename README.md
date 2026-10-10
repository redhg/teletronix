# Teletronix
**Play it online: <https://teletronix.net/>**: the
[sample](https://teletronix.net/?data=sample),
[*Tape 7*](https://teletronix.net/?data=tape7), or
[*The Haunting of Ypsilon-14*](https://teletronix.net/?data=ypsilon14). It works
offline once opened, and installs as an app (see [Online](docs/at-the-table.md#online)), or as a
[desktop app](docs/at-the-table.md#desktop-app). Drop a [package](docs/at-the-table.md#packages)
(`.ttx`) on it to play a program of your own.

A retrofuturistic terminal simulator for tabletop role-playing games, and the successor to
Phosphor.

A JSON file describes a program: screens of text that type themselves in, links, prompts and
little computers to explore, dialogs, timers and variables, all on a CRT with its glow, static
and sound. Write one by hand or in the built-in editor, then play it full screen at the table,
with the GM steering it from another window or device.

## Getting started
Requires Node 24+.

```sh
npm install
npm run dev    # http://localhost:5173
```

Programs live in `public/data/`. Pick one with `?data=<name>`; the default is `sample`.
`?data=ypsilon14` runs *The Haunting of Ypsilon-14*, converted from Phosphor. `?data=tape7` runs
*Tape 7*, a short mystery on a VCR: a space station's tape archive, its security cameras, and
what happened at 03:14 (for the GM: [Running Tape 7](docs/at-the-table.md#running-tape-7)).
`#<screen>` starts on that screen instead of the start screen, e.g.
<http://localhost:5173/?data=sample#home>, and changing it jumps there: handy while writing one.

| Script | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run table` | Build, and serve it to your network, for play at the table (see [GM remote control](docs/at-the-table.md#gm-remote-control)) |
| `npm run desktop` | Open Teletronix as a desktop app (see [Desktop app](docs/at-the-table.md#desktop-app)) |
| `npm run desktop:build` | Make the desktop app's installer for this computer, in `release/` |
| `npm run relay:dev` / `npm run relay:deploy` | Run the relay for sessions over the internet locally, or publish it to Cloudflare (see [Development](docs/development.md#layout)) |
| `npm test` | Unit tests |
| `npm run test:e2e` | Browser tests, in Chromium, Firefox and WebKit (see [Tests](docs/development.md#tests)) |
| `npm run test:e2e:quick` | Browser tests in Chromium only: about a third of the time |
| `npm run test:desktop` | The desktop app's test: starts it, and checks its window, menus and GM panel |
| `npm run lint` / `npm run format` | Biome check / fix |
| `npm run gen` | Regenerate `schema/teletronix.schema.json` and `docs/reference.md` after changing the schema |
| `node scripts/convert-phosphor.ts <in> <out>` | Convert a Phosphor JSON file |
| `node scripts/package.ts <program.json> [<out.ttx>]` | Make a package of a program and its files (see [Packages](docs/at-the-table.md#packages)) |

## Documentation
- **[Writing a program](docs/programs.md):** the file, screens, moving between them, variables,
  timers, dialogs, reveals and transitions, keys, and saving progress.
- **[Elements](docs/elements.md):** everything a screen can show, from text and links to shells,
  maps, frames and trees, and the ready-made preset screens.
- **[Look and sound](docs/look-and-sound.md):** themes, fonts, effects, and sound, including
  your own.
- **[The editor](docs/editor.md):** `?edit`, for writing programs with forms and a live preview.
- **[At the table](docs/at-the-table.md):** kiosk mode, the GM's remote control, and playing
  offline.
- **[Development](docs/development.md):** the tests, and how the code is laid out.
- **[Reference](docs/reference.md):** every property, with its type and default, generated from
  the schema.
