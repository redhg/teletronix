# Roadmap

Possible Teletronix features, grouped by area. Nothing here is scheduled unless its status says so.

| Status | Meaning |
| --- | --- |
| Idea | Worth doing someday; not scheduled |
| Next | Agreed as the next thing in its area |
| In progress | Being built now |
| Done | Built; moves to [Shipped](#shipped) with its commit |
| Declined | Ruled out; kept so it isn't proposed again |

To add an idea, add a row to its area's table. Once it's settled, move the row to Shipped or Declined.

## Visual editor

The editor's read-only Map is built (f4bb7ac). These items would grow it into a node editor, with screens as nodes and actions as edges.

| Feature | Status | Notes |
| --- | --- | --- |
| Hide or fade back-links on the Map | Idea | Less clutter from links that go back to an earlier screen |
| Edit on the Map | Idea | Add screens; draw arrows to make links |
| Canvas look for the Map | Idea | Retro styling for the pan/zoom surface |
| Markdown authoring | Idea | Write in markdown and convert it to Teletronix elements and `[style]…[/]` markup. It must never be on by default in the player, because terminal text is full of markdown characters (`>`, `***`, `_`, `#`) |
| Deck plans / floor plans | Idea | Revisit as part of the visual editor. The old ASCII `map` element was removed because it was clunky |

## GM controls

Text styles, pause and handouts are done.

| Feature | Status | Notes |
| --- | --- | --- |
| GM soundboard | Next | Play on players' devices: the program's sounds (generated or audio files), the built-in sounds, or any audio file or address. Includes Stop all |

## Online play

Sessions over the internet, package sharing and per-player sending are built. What's left is the in-fiction layer that makes Teletronix more than a voice-chat app.

| Feature | Status | Notes |
| --- | --- | --- |
| Per-player private screens and handouts | Idea | Each player gets their own terminal state |
| Voice with in-fiction comms effects | Idea | WebRTC audio, with effects like intercom crackle and the GM cutting a line. A mesh works for 4–6 players; a TURN server is the main hosting cost |
| Video | Idea | Maybe. Past about 6 players it needs an SFU |

## Desktop app and packages

The Electron app and `.ttx` packages are built.

| Feature | Status | Notes |
| --- | --- | --- |
| Open a `.ttx` in the web version | Idea | Drop the package onto the page |
| Release workflow on `v*` tags | Idea | Build the installers in CI |
| Code signing | Idea | Apple charges $99/yr. Only worth it to distribute the app widely |

## Tools' UI

| Feature | Status | Notes |
| --- | --- | --- |
| Restyle the editor and GM panel | Idea | No direction yet. A Bootstrap 5.3 restyle of Mantine was tried and reverted. Switching to React-Bootstrap was judged too costly (24 files, ~550 component uses) |

## Declined

| Idea | Why |
| --- | --- |
| CRT curvature | Keeps the DOM as the text renderer; new effects are overlays |
| Local-file handouts | The existing handouts are enough |
| Automatic Documents/Teletronix folder | Programs open from files instead |
| Switch the tools to React-Bootstrap | Too costly, and the restyle trial wasn't convincing |
| ASCII map element | Clunky; replaced by the canvas `starmap` |

## Shipped

Newest first.

| Commit | Feature |
| --- | --- |
| 3ea613a | GM panel: the upload key, in any program's panel online |
| f4bb7ac | Editor Map: a program's screens and the ways between them |
| b3dd20b | Packages through Cloudflare R2 for GMs with an upload key |
| 1e5a338 | Per-player sending: Send to, Players list, names |
| 2090c02 | Start page: join a session, open a package, or a demo |
| 06a2660 | Package sharing through the session |
| ef4c756 | Sessions over the internet on Cloudflare (Durable Objects) |
| a5c1113 | Sessions on the local relay, with join codes |
| 0a9216a | `.ttx` packages |
| 4c44a85 | Desktop app (Electron) |
| 5c2a766 | GM global pause, with a Stand by panel |
