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

## GM remote control
For one computer with two displays (e.g. a laptop for the GM and a monitor or projector for the
players): play the program in one window, and open its address with `&gm` added in another
(e.g. `?data=ypsilon14&gm`). That's a control panel for the GM, built with
[Mantine](https://mantine.dev) components, in the program's accent colour (amber for an amber
terminal, and so on), and light, dark or as your system is set (the switch in the top corner).
Along the top, always: whether the players are connected (**LIVE**) and the screen they're on
(and any open dialog), **Back** and **Restart** (which do what the actions of those names do),
and pairing with another device.
The rest is in tabs (<left> and <right> move between them, and the panel opens at the last):
- **Screens:** every screen, under its `parent`, or found by name. A click sends the players
  there.
- **Messages:** **transmit** a message, typed into a dialog on the players' screen, with its
  own button text, and in the alert colour if you like (Cmd/Ctrl+Enter sends it). And open
  any of the program's dialogs, or close the open one.
- **Variables:** every variable, live. Change one (Enter sets it) and the players' screen
  follows, as if an action had set it. And each timer's time, with Start, Stop and Reset.
- **Effects:** turns any effect on or off over what the program and screen say, or back to
  what they say, and sends a **burst of static**. And, for a program with
  [audio files](look-and-sound.md#audio-files-and-ambience), the **ambience**: what's playing,
  and another file of the program's, silence, or back to what the program and screen say.
- **Devices:** a QR code for a players' device (see below), and a button to open a players'
  window on this computer.

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
The GM's panel can also be on another device on the same network as the players' (e.g. the
GM's laptop controlling a tablet), with Teletronix served from a computer on that network:
1. On that computer, run `npm run table`. It builds Teletronix and serves it to the network,
   and prints its address there, e.g. `http://192.168.2.139:4173/`. (`npm run dev -- --host`
   works too, while working on Teletronix.)
2. On the GM's device, open the program with `&gm`, e.g. `http://localhost:4173/?data=ypsilon14&gm`
   on that computer. In the **Devices** tab, choose **Show a QR code** (and tick **As a
   kiosk** for a dedicated screen).
3. Scan the QR code with the players' device's camera. It opens the program there, already
   paired with the panel, and shows `REMOTE K7QX · GM CONNECTED` in the corner.

Or the other way round, without a camera: open the program on the players' device with
`&remote` added, e.g. `http://192.168.2.139:4173/?data=ypsilon14&remote&kiosk`. It shows a
pairing code in the corner, e.g. `REMOTE K7QX · WAITING FOR GM`, for a few seconds (and again
with **Ctrl+Alt+G**, or whenever the connection changes); type it into the panel's "Another
device's code" and choose **Pair**.

Messages go through the server on that computer, so it works without internet, and only a
panel with the code can control the terminal (`&remote=K7QX`, as in the QR code, gives the
terminal that code). The code stays the same on that device, and the
panel remembers it, so they pair again by themselves after a reload or a dropped connection.
Without `&remote`, a terminal can't be reached from other devices at all. A copy hosted
online (e.g. on GitHub Pages) has no server to pass messages through, so the code shows as
unavailable there.

## Offline
Once Teletronix has been opened, it works without a network: the app, its fonts, and every
program in `public/data` (with its images) are kept on the device. It can also be installed as
an app ("Install" in Chrome and Edge, "Add to Home Screen" on iPhone and iPad), which opens full
screen, without the browser around it, at the last program played on that device.

A new version installs in the background and takes over the next time Teletronix is opened
after all its tabs and windows have closed, so it never interrupts a session. Offline caching
only runs in a build (`npm run build`, `npm run preview`), not the dev server.

The icon is drawn in `public/icons/icon.svg`; after changing it, run `node scripts/icons.ts`
to render the PNG sizes.
