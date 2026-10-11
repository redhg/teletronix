# At the table

## Kiosk mode
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
- In full screen, the browser also uses Esc to leave full screen, and a web page can't stop
  it; kiosk mode goes back to full screen at the next key or tap. For a smoother kiosk, set
  `"skipKeys": ["Space"]` so players skip with Space instead.

## Players' own settings
**Ctrl+,** (or a long press, or a right-click, on the sound toggle `[♪]`) opens quick settings: for
that player, on that device, over what the program says, and kept there for that program.
- **Sound** on or off, and its **volume**.
- **Look**: as the program made it, or high contrast, dark or light (see
  [Appearance](look-and-sound.md#appearance)), which also turns the effects off.
- **Text size**, from 75% to 200% of the program's.
- **Effects** on or off.
- **Text** typed in, or all at once.
- **Pointer**: the program's, or the device's own (for a program with a pointer of its own).

The arrow keys move between the rows and change the one chosen (or click its ◄ and ►); Esc closes
it, and **Reset** goes back to the program's. Until a player chooses, a device set to reduce
motion shows text at once (and the effects keep still), and one set to more contrast starts in
high contrast. `"playerSettings": false` in the config leaves quick settings out, e.g. for a
kiosk players shouldn't change. (The editor's preview always shows the program as it is.)

## GM remote control
For one computer with two displays (e.g. a laptop for the GM and a monitor or projector for the
players): play the program in one window, and open its address with `&gm` added in another
(e.g. `?data=ypsilon14&gm`). That's a control panel for the GM, built with
[Mantine](https://mantine.dev) components, in the program's accent colour (amber for an amber
terminal, and so on), and light, dark or as your system is set (the switch in the top corner).
Along the top, always: whether the players are connected (**LIVE**) and the screen they're on
(and any open dialog), **Back** and **Restart** (which do what the actions of those names do),
**Pause**, and the session other devices join (see [From another device](#from-another-device)).

**Pause** stops the players' terminal for a break at the table: text stops typing, timers stop
counting (a self-destruct countdown waits where it is), videos and the ambience stop, and nothing
moves on, under a cover, `PLEASE STAND BY` in the program's own look. Only the GM lifts it
(**Resume**), and everything carries on where it was. The **Stand by** panel, in the Messages tab,
sets the cover up: a message of your own, an image of the program's behind it, and one of its
audio files looping; changed while paused, the players' cover changes at once.
The rest is in tabs (<left> and <right> move between them, and the panel opens at the last):
- **Screens:** every screen, under its `parent`, or found by name. A click sends the players
  there.
- **Messages:** **transmit** a message, typed into a dialog on the players' screen, with its
  own button text, and in the alert colour if you like (Cmd/Ctrl+Enter sends it). Open any of
  the program's dialogs, or close the open one. And **Stand by**, the cover for a pause (below).
- **Media:** interrupt the players with something to see or hear, at any moment.
  **Handouts** shows any image or video the program has (or another, by its file or address)
  over their whole screen, as a [view](elements.md) does, until it's closed. The **Soundboard**
  plays them any of the program's sounds, generated or audio files, Teletronix's own (an
  alert, a beep, static, a glitch…), or any audio file by its address, over whatever's on
  screen. **Ambience**, for a program with [audio files](look-and-sound.md#audio-files-and-ambience),
  shows what's looping in the background, and switches it to another of the program's files,
  silence, or back to what the program and screen say. **Stop all** closes what's showing and
  stops the sounds playing.
- **Variables:** every variable, live. Change one (Enter sets it) and the players' screen
  follows, as if an action had set it. And each timer's time, with Start, Stop and Reset.
- **Effects:** turns any effect on or off over what the program and screen say, or back to
  what they say, and sends a **burst of static**.
- **Devices:** a QR code for a players' device (see below), a button to open a players'
  window on this computer, and **Players**: every players' window, in this browser or the
  session, with the screen it's on. Name each (e.g. "Engineer"; it keeps its name through a
  reload), and send to one alone with **Only to them**.

**One player at a time.** With more than one players' window, **Send to** (at the top) chooses
who the panel's for: everyone, or one. While it's one, an orange **Only to ENGINEER** says so,
and everything the panel does goes to that window alone (a screen, a message, a handout, a
sound, effects, a pause: a private screen for the engineer, say), and the panel shows that
window's screen and state. **Everyone** goes back to all of them. Windows that are apart show
as "Players on various screens".

**Cmd/Ctrl+K** (or **Commands…**) opens a command palette, to do any of it by typing a few
letters: go to a screen (by its title or id), open a dialog, turn a true/false variable over or
change another (it opens its field), start, stop or reset a timer, turn an effect on or off,
send a burst of static, or start a transmission.

When a new version of Teletronix is waiting (see [Offline](#offline)), the panel says so, and
**Reload** switches to it there and then, rather than once every Teletronix window has closed.
Players' windows get it the next time they're opened or reloaded.

The two windows talk directly, within the browser, so it needs no setup or network, and the
game carries on if the panel closes. Every players' window of that program follows the panel.

#### From another device
The GM's panel can also be on another device: across the table (e.g. the GM's laptop
controlling a tablet), or anywhere. Its session goes through a relay, which passes the GM's and
players' messages on:
- **Online** (e.g. at <https://teletronix.net/>), through Teletronix's relay on the internet:
  the GM and players can be on different networks, or in different places. Open the program
  with `&gm`, choose **Start a session**, and players join as below, at the same address.
- **On a local network,** with no internet needed, through the relay of the computer serving
  Teletronix (or the [desktop app](#desktop-app), which serves it by itself):
1. On that computer, run `npm run table`. It builds Teletronix and serves it to the network,
   and prints its address there, e.g. `http://192.168.2.139:4173/`. (`npm run dev -- --host`
   works too, while working on Teletronix.)
2. On the GM's device, open the program with `&gm`, e.g. `http://localhost:4173/?data=ypsilon14&gm`
   on that computer, and choose **Start a session** at the top. The panel shows the session's
   code, e.g. `BCDF-1234`: four letters, then four digits.
3. Players' devices join it, either way:
   - **By QR code:** in the **Devices** tab, choose **Show a QR code** (and tick **As a kiosk**
     for a dedicated screen), and scan it with the players' device's camera. It opens the
     program there, in the session.
   - **By typing the code:** open the program on the players' device with `&join` added, e.g.
     `http://192.168.2.139:4173/?data=ypsilon14&join`. It asks for the code; any case will do,
     with or without the dash.

A device in the session shows it in the corner, e.g. `SESSION BCDF-1234 · GM CONNECTED`, for a
few seconds (and again with **Ctrl+Alt+G**, or whenever the connection changes). The **Devices**
tab lists the devices that have joined, and the screen each is on; **Remove** takes one out of
the session (it asks for a code again). **End** ends the session; **Start a session** then
makes a new code.

On a local network, messages go through the server on that computer, so it works without
internet; online, through Teletronix's relay (a page served from this computer or its network
always uses its own). Only the panel that started the session can control its devices: it holds a secret for it that's never shown
or typed, so knowing the code lets a device join, but not take over. Both sides remember the
session, so they join it again by themselves after a reload or a dropped connection. Without
`&join`, a terminal can't be reached from other devices at all. (`&remote`, from before
sessions, does what `&join` does.) If the relay can't be reached, the session says so: for a
copy served from a computer, start it with `npm run table`; online, check the connection.

## Desktop app
Teletronix also comes as an app for macOS, Windows and Linux: the same Teletronix, in a window of
its own, that serves other devices on the network itself, with nothing to install or run first.
- **From the repository:** `npm run desktop` (after `npm install`) builds Teletronix and opens
  it. `npm run desktop -- --kiosk` opens it full screen, as `?kiosk` does.
- **Installers:** `npm run desktop:build` makes one for the computer it's on, in `release/`.
  Pushing a version tag (`git tag v0.2.0 && git push --tags`) builds all three on GitHub and
  attaches them to a release of that tag (`.github/workflows/release.yml`).
- **Unsigned:** the installers aren't code signed (that needs paid developer accounts). On a Mac,
  the first time, right-click the app and choose **Open** (or allow it under **System Settings →
  Privacy & Security**); on Windows, choose **More info → Run anyway**.

It opens at the last program played. Its menus:
- **File → Open Program…** (Cmd/Ctrl+O) plays a program from its `.json` file, wherever it is.
  Its folder stands in for `public/data`, so its files go beside it as they do there: an image
  named in it as `data/images/map.png` is `images/map.png` next to the program. **Open
  Recent** has the last few; dropping a program on the app's icon (on a Mac), or naming it when
  starting the app, opens it too.
- **[Packages](#packages):** **File → Export as Package…** makes one of the program on screen
  (its own or a built-in one); **Open Program…** plays one, as does double-clicking one, once
  the app's installed. A package is only for playing: its editor's **Save** downloads.
- **File → Built-in Programs:** the sample, *Tape 7*, *Ypsilon-14* and the rest.
- **File → Edit This Program** opens the [editor](editor.md#the-editor). For a program opened
  from a file, **Save** writes into that file; for a built-in one, it downloads, as online.
- **Window → GM Panel** (Cmd/Ctrl+Shift+G) opens the [GM's panel](#gm-remote-control) in a window
  of its own; **New Players' Window** (Cmd/Ctrl+N) another players' window.

Other devices reach it as they reach `npm run table`: its panel's **Devices** tab shows the QR
code and the address (port 4173, or the next free one). The first time, macOS (or Windows) asks
whether to let it accept connections from the network; allow it for other devices to pair.

## Packages
A package (`.ttx`) is a program and all its files in one file, to hand to someone: they can play
it in a browser (online, at <https://teletronix.net/>, too) or in the
[desktop app](#desktop-app), with nothing else to set up.
- **Making one:** in the desktop app, **File → Export as Package…**; or `node scripts/package.ts
  heist.json [heist.ttx]`. Either takes the program and every image, sound and video it names
  (`data/…`), from beside it, or Teletronix's own, and says which it couldn't find. Inside,
  it's a zip, laid out as `public/data` is: `heist.json`, `images/vault.png`… A `.zip` of a
  program's folder, as Finder's **Compress** makes, works as a package too.
- **Playing one in a browser:** drop it on a Teletronix page (any program's), or press
  **Cmd/Ctrl+O** there and choose it. It plays as `?data=ttx:` and an id made from its contents
  (e.g. `?data=ttx:0nqmm8fa1t2`: the same file, the same id, and nothing of its name, which
  could give something away to players who see the address or a QR code), and stays in that
  browser (the latest ten opened), so a reload, the [GM's panel](#gm-remote-control) in another
  window, and playing [offline](#offline) all have it. The editor opens it too
  (`?edit&data=ttx:0nqmm8fa1t2`), and downloads it when saved.
- **On another device:** a package lives in the browser that opened it, so a device the GM's
  QR code (or `&join`) opens may not have it. If the GM's panel is playing it, in a
  [session](#from-another-device), the device asks the panel for it: it says how big it is
  (`THE GM IS SHARING PROGRAM DATA (6.8 MB)`; never its name, which could give something away),
  and once the player chooses **Accept**, the
  panel sends it there, through the session, and it plays (and stays, as one opened there). The
  panel's **Devices** tab shows how far it's got. Nothing is stored anywhere on the way, so it
  works for packages up to 50 MB; for a bigger one, or without a session, the device can
  choose the package's file itself.
- **Faster, with an upload key:** online, a GM with an upload key (from whoever runs
  Teletronix's relay: `npm run relay:key -- add "Name"` makes one) puts it in the panel's
  **Devices → Sharing**. The package then goes through Cloudflare: uploaded once, when a device
  first asks for it, downloaded by the players who accept it, and deleted when the session ends
  (or a day after, whatever happens). Up to 50 MB a package, and 500 MB a day a key. Should
  anything fail (a key that's been taken back, say), it goes through the session instead, and
  the panel says why. (The desktop app serves a package it opened to other
  devices itself.)

## Running Tape 7
*Tape 7* (`?data=tape7`) is a short mystery, for one sitting. The players are the recovery crew of
the Kepler Relay Station, which stopped answering on day 11, at its tape archive. **Spoilers:**
- **The way through:** tape 04 shows a sticky note with the security desk's password, `HALCYON`.
  The log and the desk point at 03:14, when CAM 3 lost its signal; searching for `03:14` finds the
  camera's buffer, and the desk recovers it. That starts a 90-second **archive purge**; playing the
  recovered tape (the CAM 3 tile, or Tape 07 under Tapes) to its end stops it. Run out of time and
  the archive is erased.
- **From the panel:** **Pause** (with a cover message, say, "SIGNAL INTERRUPTED") gives them a
  moment; the purge waits too. Under Media, a **handout** of `data/tape7/tape04.mp4` replays the
  password tape for a stuck table, and the soundboard's alert is someone at the airlock. Under
  Variables, `found`, `secure` and `recovered` skip a step; the purge timer can be stopped or reset.
- Its footage is generated by `scripts/tape7-footage.py` (FFmpeg and Pillow, with the Home Video
  font), so there's nothing filmed to license; the drone is by newlocknew on Freesound (CC BY-NC
  4.0, so not for sale).

## Offline
Once Teletronix has been opened, it works without a network: the app, its fonts, and every
program in `public/data` (with its images) are kept on the device. It can also be installed as
an app ("Install" in Chrome and Edge, "Add to Home Screen" on iPhone and iPad), which opens full
screen, without the browser around it, at the last program played on that device.

A new version installs in the background and takes over the next time Teletronix is opened
after all its tabs and windows have closed, so it never interrupts a session. Offline caching
only runs in a build (`npm run build`, `npm run preview`), not the dev server.

**Which version is this?** Add `?version` to the address (e.g.
<https://teletronix.net/?version>): it shows the build this browser is running and the one online
now, and whether they're the same. If they aren't, the newer one is downloaded and waiting, or
will take over once every Teletronix tab and window has closed; **Switch to it now** does it at
once, when it's ready. In the browser's console, `teletronix.version` names the build, e.g.
`0.2.0 (871c5e7, built 2026-10-10 16:45 UTC)`: the version (from `npm version`), the commit it
was built from, and when.

The icon is drawn in `public/icons/icon.svg`; after changing it, run `node scripts/icons.ts`
to render the PNG sizes.

## Online
Teletronix is published at <https://teletronix.net/> (e.g.
<https://teletronix.net/?data=ypsilon14>), so any device can play it without a
computer serving it: open it once, and it works [offline](#offline) from then on, or install it
as an app. Every push to `main` publishes the new version, once the checks and browser tests
have passed (the `deploy` job in `.github/workflows/ci.yml`); a device picks it up the next time
Teletronix opens there. Its address alone (or any without `?data=`) is the start page: **join a
GM's session** by its code (it asks the GM's panel which program it's playing, and goes
there), **open a package** (or drop one on it), play one opened there before (one a GM shared
is listed by no name: it could give something away), or a demo; each with **[GM]** for its
GM's panel. It's GitHub Pages, on a domain of its own: the old address,
`redhg.github.io/teletronix/`, redirects there (but saved settings, progress and opened packages
stay with the address they were made on).

The online copy is only files, with no server behind it, so two things need
`npm run table` (or `npm run dev`) instead:
- The GM's [remote control](#gm-remote-control) from **another device**: pairing goes through the
  server. A panel in another window of the same browser works online too.
- **Saving** in the [editor](editor.md#the-editor): online, Save downloads the file, to put
  into `public/data/` and push.

To publish from a fork: make the repository public (GitHub Pages is free for public
repositories), and under **Settings → Pages**, set **Source** to **GitHub Actions**. A fork
publishes at `<user>.github.io/teletronix/`, unless it's given a custom domain there too.
