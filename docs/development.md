# Development

## Tests
Three suites, all run on every push by GitHub Actions:

- **Unit tests** (`npm test`, Vitest): the engine, schemas, modules' behavior and the
  generated files, with a fake clock. Next to the code, as `*.test.ts`.
- **Browser tests** (`npm run test:e2e`, Playwright): the player, the editor and the GM's
  panel, driven as a user would, in Chromium, Firefox and WebKit. In `e2e/`, one
  file per feature. They build the app and serve it on port 4180, so a running dev server
  (or `npm run table`) doesn't matter.

- **The desktop app's test** (`npm run test:desktop`, Playwright): starts the app itself
  (`desktop/app.spec.ts`) with a program from a file of its own, and checks its window, menus,
  GM panel, saving, and opening where it left off. On Linux it needs a display (`xvfb-run`, as CI does).

The first time, install the browsers with `npx playwright install`. Then:

While working on something, run its own browser tests; before committing, the quick run;
CI runs everything, in all three browsers, on every push. Changes to shared foundations (the
engine's reveal and timing, key handling, layout, autoscroll) are worth a full local run,
since they can break one browser only.

```sh
npm run test:e2e                         # everything
npm run test:e2e:quick                   # everything, in Chromium only
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
- `src/editor/`: the program editor (`?edit`), built with Mantine like the GM's panel; their
  shared pieces are in `src/mantine/`. The dev server's save endpoint is
  `scripts/editor-save.ts`.
- `src/remote/`: the GM's control panel (`&gm`, built with Mantine like the editor; players
  never load it), and the players' side of it. The relay that passes their messages between
  devices is `scripts/remote-relay.ts`, in Vite's servers.
- `desktop/`: the [desktop app](at-the-table.md#desktop-app), in Electron. `main.ts` (its
  windows and menus) and `server.ts` (the build, a program opened from a file, the relay
  and the editor's saving) run as TypeScript, as Node runs it, with no build of their own;
  `electron-builder.json` packs them with `dist/` into the installers.
- `src/ui/`: the React layer. Per-frame text is written straight to the DOM, so React only
  re-renders on structural changes.
- `src/assets/fonts/`: the bundled fonts, and the symbol fonts made for the ones that lack box
  lines, blocks and arrows (`symbols-<font>.otf`). `node scripts/symbols-font.ts` makes them
  again, from each font's measurements and the symbols' shapes in that script; a test fails
  if they're out of date.
