# Teletronix
**Play it online: <https://redhg.github.io/teletronix/>**: the
[sample](https://redhg.github.io/teletronix/?data=sample), or
[*The Haunting of Ypsilon-14*](https://redhg.github.io/teletronix/?data=ypsilon14). It works
offline once opened, and installs as an app (see [Online](docs/at-the-table.md#online)).

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
`?data=ypsilon14` runs *The Haunting of Ypsilon-14*, converted from Phosphor.
`#<screen>` starts on that screen instead of the start screen, e.g.
<http://localhost:5173/?data=sample#home>, and changing it jumps there: handy while writing one.

| Script | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run table` | Build, and serve it to your network, for play at the table (see [GM remote control](docs/at-the-table.md#gm-remote-control)) |
| `npm test` | Unit tests |
| `npm run test:e2e` | Browser tests, in Chromium, Firefox and WebKit (see [Tests](docs/development.md#tests)) |
| `npm run test:e2e:quick` | Browser tests in Chromium only: about a third of the time |
| `npm run lint` / `npm run format` | Biome check / fix |
| `npm run gen` | Regenerate `schema/teletronix.schema.json` and `docs/reference.md` after changing the schema |
| `node scripts/convert-phosphor.ts <in> <out>` | Convert a Phosphor JSON file |

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
