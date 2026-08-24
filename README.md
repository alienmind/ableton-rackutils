![ableton-rackutils](doc/logo.jpg)

# ableton-rackutils

A toolkit for Ableton rack files (`.adg`). Rearrange the macro knobs on a rack,
see what each one actually drives, and rename or recolour them - from a web
page, or from the command line.

**Live site:** https://alienmind.github.io/ableton-rackutils/

> **v0.0.1, pre-alpha. Not usable as a rack editor yet.** The web page can open
> a rack and show you what is inside it, but the editing UI is not wired up.
> The command line tools below do work today. See [What works today](#what-works-today).

> **Keep backups.** This tool rewrites rack preset files. A bug can produce a
> file that loads in Live without complaint and behaves incorrectly, including
> silently breaking every Macro Variation in the rack. Work on copies until you
> have checked the result in Live yourself.

## Your files stay on your machine

The website is a static page with no backend and no account. Your `.adg` is
opened, edited, and rebuilt inside your browser tab. There is no server for it
to be uploaded to - the [source](https://github.com/alienmind/ableton-rackutils).

The command line tools never touch the network at all.

## Why the file, and not a plugin

Live will tell a plugin what value a macro is currently at, but never which
parameter that macro drives. That information exists only in the saved file.
So editing a mapping means editing the file: save the rack from Live, change
it here, load it back.

Practical consequences:

- Save the rack to disk first (click the disk icon in the rack's title bar, or
  drag the rack into Live's browser). The saved file is what gets edited.
- Anything you changed since that save is not in the file, so it will not be
  in the result.
- To see your edit in Live, drag the modified file back onto the rack.

## What works today

| | Status |
|---|---|
| Open a rack in the browser and inspect its structure | works |
| Edit macros in the browser | not yet - the UI is being built |
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
  Macro 1 (Macro 1) -> MacroControls.0 [0..127], ChainSelector [0..127]
  Macro 2 (DR GAIN) -> Gain [0..56.2341309]
  Macro 3 (EQ LOW) -> GainLo [0.0003162277571..1.99526238]
```

One macro can drive several parameters, so a line can list more than one
target. The numbers in brackets are the range that macro sweeps the parameter
across.

### Move a macro to a different knob

```bash
pnpm adg-tool move my-rack.adg 1 5 out.adg
```

Moves macro 1 to position 5, taking its name, colour, value, every parameter it
drives, and its variation values with it. Macros 2 through 5 slide up by one to
make room, exactly as dragging the knob would. Nothing is overwritten and
nothing is lost.

Then drag `out.adg` from your file manager onto the rack in Live to load it.

There is also `move-mapping`, with the same arguments, which moves only what a
macro drives and leaves its name and colour behind - and which clears whatever
the destination knob was driving. It is the narrow primitive underneath `move`;
you probably want `move` unless you specifically want that.

### Look inside a rack file

```bash
pnpm adg-tool unpack my-rack.adg > rack.xml
pnpm adg-tool diff before.adg after.adg
```

An `.adg` is a gzipped XML document. `unpack` gives you the readable version;
`diff` shows what changed between two saves, which is a good way to work out
how Live stores something.

## The website

Open https://alienmind.github.io/ableton-rackutils/ and drag a `.adg` onto the
page. It works offline once loaded, and on a machine with no Ableton installed.

Right now it decompresses the file and shows its raw structure, collapsed;
click a node to expand it. The macro editor described above is the next thing
being built for it.

To run it yourself instead:

```bash
pnpm dev      # http://localhost:5173
```

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
