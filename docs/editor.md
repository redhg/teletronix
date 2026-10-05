# The editor
`?edit` opens a program in the editor, e.g. <http://localhost:5173/?edit&data=sample> (or a name
with no file yet, for a new program). On the left, the program's parts; in the middle, a form for
the one chosen; on the right, a live preview, which shows appearance changes at once and
restarts with anything else, on the screen it was showing (⟲ restarts it by hand).
- **Program:** its name, start screen, bars, and how screens appear. The fields are built from
  the schema, each with its description and default: leave one empty (or choose ↺) to use the
  default. A setting that's one of several kinds (a reveal, a transition, a screen's preset, a
  dialog) is a list to pick from, with the chosen kind's own options under it (e.g. a teletype
  reveal's `speed`); it's written as just the name until an option is set, and switching kinds
  keeps the options both have. Anything else more involved than text, a number or a switch is
  edited as JSON.
- **Appearance:** colours, font, text size, line spacing, effects and sound.
- **Variables & timers:** each variable's name, kind (true/false, number or text) and starting
  value, and each timer's settings; add and delete them here.
- **Sounds:** the program's own sound effects, designed sfxr-style: roll one from a preset
  (blip, laser, explosion…), mutate it, adjust its wave and sliders by ear, and play it. Play
  one with `"sound": "its-name"`; **Rename** renames what plays it. And Teletronix's own
  sounds (the key click, beeps, glitch…), tuned by ear (see [Sound](look-and-sound.md#sound)).
- **Screens:** every screen, under its `parent`, or found by name; **+** adds one (under the one
  chosen). A screen's page has its settings (folded away) and its content, an element to a row:
  open one to edit it: **Settings**, a form built from its type's schema, or **JSON** (for
  anything a form can't do, e.g. a section's contents). Rows move up and down, duplicate, copy
  (**Paste** puts the copy at the end of any screen) and delete, and **Add an element** picks any
  type, by its name or what it does. **Rename** renames
  links and anything else that names the screen; **More** duplicates or deletes it. The preview
  shows the screen you're on.
- **Dialogs:** listed under the screens; **+** adds one. Its kind (alert or confirm) is a list,
  with that kind's settings under it. **Rename** renames the actions that open it; **Open in the
  preview** opens it there.

It checks the program as you go: the problems badge lists each mistake, and goes to it (to the
element, open, for one in a screen). Undo and redo with **Cmd/Ctrl+Z** and
**Cmd/Ctrl+Shift+Z**. **Save** (**Cmd/Ctrl+S**) writes `public/data/<name>.json` in
`npm run dev`; anywhere else (e.g. a build), it downloads the file instead. It writes JSON the
way it's written by hand: short and flat things on one line, the rest spread out. The **File**
menu starts a new program, opens a JSON file, and downloads.
