![ableton-rackutils](doc/logo.jpg)

# ableton-rackutils

A toolkit for Ableton rack files (`.adg`). Rearrange the macro knobs on a rack,
see what each one actually drives, and rename or recolour them - from a web
page, or from the command line.

**Live site:** https://alienmind.github.io/ableton-rackutils/

> **v0.0.1, pre-alpha.** The macro editor works, and an edited rack has been
> saved out and loaded back into Live - once, by hand. Treat it as something to
> try on copies. See [What works today](#what-works-today).

> **Keep backups.** This tool rewrites rack files, and a bug here can produce a
> rack that loads fine and misbehaves quietly - a broken Macro Variation, say.
> Work on copies until you have checked the result in Live yourself.

## Your files stay on your machine

The website is a static page with no backend and no account. Your `.adg` is
opened, edited, and rebuilt inside your browser tab. There is no server for it
to be uploaded to.

## Why it works on files

Live keeps macro mappings to itself. You can see and change them by hand in
Live, but they are not open to plugins or scripts, so a tool like this one has
to go through the saved rack file: save the rack from Live, change it here,
load it back. ([Details](doc/DEVELOPERS.md#why-this-tool-edits-files).)

What that means in practice:

- Save the rack to disk first (click the disk icon in the rack's title bar, or
  drag the rack into Live's browser). The saved file is what gets edited.
- Anything you changed since that save is not in the file, so it will not be
  in the result.
- To see your edit in Live, drag the modified file back onto the rack.

## What works today

| | Status |
|---|---|
| Open a rack in the browser and see its macros, chains and drum pads | works |
| Rearrange, rename, recolour and rebind macros in the browser | works |
| Save the result and load it back into Live | works, lightly tested |
| Inspect and rearrange macros from the command line | works |
| Companion Max for Live device | downloadable, but a scaffold - it confirms it is talking to Live and nothing more |

## The command line tools

Needs Node 20+ and pnpm 10.

```bash
git clone https://github.com/alienmind/ableton-rackutils
cd ableton-rackutils
pnpm install
```

### See what your macros are wired to

```bash
pnpm adg-tool mappings my-rack.adg
```

```
AlienMind Drum Rack - 8 visible macros
  Macro 2 (DR GAIN) -> Gain [0..56.2341309]
  Macro 3 (EQ LOW) -> GainLo [0.0003162277571..1.99526238]
  Macro 4 (EQ MID) -> GainMid [0.0003162277571..1.99526238]
```

The numbers in brackets are the range that macro sweeps the parameter across.
A macro can drive several parameters at once, so a line can list more than one.

### Move a macro to a different knob

```bash
pnpm adg-tool move my-rack.adg 1 5 out.adg
```

Moves macro 1 to position 5, taking its name, colour, value, every parameter it
drives, and its variation values with it. Macros 2 through 5 slide up by one to
make room, exactly as dragging the knob would. Nothing is overwritten and
nothing is lost.

Then drag `out.adg` from your file manager onto the rack in Live to load it.

If you want to move only what a knob drives and leave its name and colour
behind, `move-mapping` takes the same arguments and does that instead.

## The website

Open https://alienmind.github.io/ableton-rackutils/ and drag a `.adg` onto the
page. It works offline once loaded, and on a machine with no Ableton installed.

The page walks you through getting a rack out of Live in four steps, then
lays the rack out the way Live does: macro knobs, chains, and devices running
left to right, with nested racks and drum pad grids drawn in place.

- **Drag a parameter onto a macro knob** to bind it - a patch cable follows
  your pointer.
- **Drag a knob onto another** to move that macro, or hold Shift to swap two.
- **Double-click** a name to rename it, click a swatch to recolour it.
- Under the rack, every mapping is listed in full: rack, macro, device,
  parameter.

The knob is still a placeholder shape, though the colours are Live's own.

Saving downloads a copy with `-edited` on the end. Your original file is never
touched.

## The companion device (optional)

A Max for Live device, downloadable from the site, that carries the same editor
inside Live and adds the two things only Live knows: which rack you have
selected, and what its knobs are doing right now. Everything the tool does
works without it.

Currently a scaffold - it loads, confirms it is talking to Live, and nothing
else yet.

## Contributing

Development setup, repo layout, the schema findings, and the plan are in
[`doc/DEVELOPERS.md`](doc/DEVELOPERS.md).

## License

[MIT](LICENSE)
