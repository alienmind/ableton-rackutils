# ableton-rackutils: what is left

**v0.4.2. The editor works end to end and is deployed.** Racks it edited, and
racks its contract authored, have been loaded back into Live and played.

This document is the BACKLOG. How the thing is built, what may not be assumed,
and what has already cost a day is in the companion docs:

| Where | What |
|---|---|
| [`doc/DEVELOPERS.md`](DEVELOPERS.md) | setup, layout, the three test suites, the constraints, the rules, the contract's insertion knowledge, the pipeline |
| [`packages/adg-codec/SCHEMA.md`](../packages/adg-codec/SCHEMA.md) | Q1..Q24, the file format as confirmed against real racks. Nothing may be modelled that is not recorded there |
| [`README.md`](../README.md) | what the tool does, for someone using it |

---

## Confirmed by hand, and not

The suites are green by definition; this is the list that means anything. Every
bug this project has hit came from using it on a real rack, including a UI
whose every interaction was broken while its whole suite passed (SCHEMA.md
Q12).

| | State |
|---|---|
| A rack edited here loads in Live and sounds right | confirmed |
| Contract features: gain, gate, compressor, filter, EQ Three | confirmed in Live |
| Chain selector on an ordinary rack | confirmed in Live |
| Chain selector on a DRUM rack | **broken in one combination - see Backlog 1** |
| Saving over the original file | confirmed on a real file |
| The Max for Live device | installed, opens, carries the editor |
| Plugin scan resolving a real plugin | confirmed against a real VST3 folder |
| The animations | confirmed by eye |
| Phone: opening a rack, scrolling the row, dragging a knob | confirmed on a Pixel 9a |
| Phone: install from the Chrome menu | confirmed; the automatic prompt does not appear |
| Beta previews | confirmed end to end |

---

## Backlog

### 1. The drum-rack chain selector, in combination

The one known FAULT. On a drum rack, a chain selector applied alongside the
full set of features stops selecting, while every smaller combination works.

Bisected three times, all in Live:

| Rack | What it had | Result |
|---|---|---|
| `KD-selector-only` | the selector alone | works |
| `KD-no-selector` | every feature, the original selector untouched | works |
| `KD-sel-gain`, `KD-sel-gate`, `KD-sel-eq` | selector + one feature, 12 macros | all work |
| `KD-sel-three` | selector + three features, 12 macros | works |
| `KD-sel-16macros` | selector + one feature, bank widened to 16 | works |
| `KD-features` | selector + all six features, 16 macros | **fails** |

So it is neither the shift alone nor the bank size alone: it takes five or six
features. Next bisect is a rack with five, and one with six minus the chain
selector's own slot, to find where it turns over. The generated file's wiring
is identical to a hand-built rack that works - same `BranchSelectorRange`
partition, same `ChainSelector` KeyMidi, same range - so what differs is
somewhere the diff has not been pointed yet.

Scratch racks are built by `packages/adg-codec/tmp/bisect*.mts` and written to
`tmp/`.

### 2. Mapping table units

Min and Max show as raw numbers. Live shows the target parameter's own units
(`20.0 Hz`, `-inf dB`), which are not recoverable from the file for every
parameter type. patchbay's donor index knows the native range per parameter, so
importing it would supply this. The last open item of the editor.

### 3. A rack with no room for the contract's macros

The contract's macros go at the front and a rack cannot exceed 16 slots
(Constraint 6). `donors/PD.adg` is exactly that case, with all 16 in use. The
tool should say so and offer to wrap the rack rather than wrapping it silently,
and the parent must match what it wraps: `InstrumentGroupDevice` around an
instrument rack, `AudioEffectGroupDevice` around an effect rack.

### 4. Schema questions still open

Each needs a diff, not a guess (DEVELOPERS.md, Rules):

- **A VST2 or an Audio Unit is some other tag** (Q17). `Rack.plugins` looks for
  `Vst3Preset` only, so a rack whose plugin is one of the others reports none -
  wrong but honest. Save a rack holding one of each and diff.
- **What a MAPPED `PowerMacroControlIndex` looks like** (Q20). It is -1 in
  every donor; the range read for a power binding is inferred from the
  element's shape. Map a plugin's on/off to a macro, save, diff.
- **Range inversion** (Q4). The editor writes `Min > Max` and the only direct
  evidence Live honours it is patchbay's note. Confirm with our own diff.
- **The external sidechain source** (Q14). A preset keeps the switch and drops
  the source, so the contract offers the switch only. If a diff ever shows a
  preset carrying a source, the option can grow.

### 5. Phone polish

The knob drag takes a 350ms hold before it starts. That number is a guess that
survived one test on one device; if it feels wrong in the hand it is one
constant in `holdToDrag.ts`. If the knobs themselves are fiddly to hit, the fix
is a bigger target under `@media (pointer: coarse)`, sized from a real report.

### 6. Housekeeping

`gh-pages` keeps superseded asset bundles and every beta preview folder, both
by design (`keep_files`, so a preview survives a main deploy). Nothing breaks;
it grows. Delete a preview folder when its branch merges.

---

## Parked

Considered and not being built. Each entry says what killed it, so the same
ground is not covered twice.

- **Session and project scaffolding** - generating tracks, routing, an `.als`.
  A coherent product and a different one. The boundary that keeps this honest:
  anything inside one `.adg` is in scope, anything naming a track is not.
- **A DSL front end** - patchbay already is one, and deriving a contract from a
  rack the user already likes covers the same ground with no language to learn.
- **Batch operations across a rack library** - real for a large library; the
  target user has eight racks, one per track. A per-rack button is the whole
  feature at that scale.
- **Live values on the knobs, and click-to-pick a parameter in Live** - both
  need LOM and were interesting while the device was a product. With the device
  reduced to a bundle, neither earns the machinery. Click-to-pick also had an
  unsolved half: matching a LOM parameter back to its element path.
- **Scripted hotswap reload** - `browser.hotswap_target` appears read-only, so
  a script probably cannot point hotswap at a device the user has not already
  put there. Dragging the file back always works.
- **The loopback WebSocket bridge, and a Python control surface** - both existed
  for live values. Parked with them.
- **Macro Variation authoring** - variations must stay correct under a move
  (Constraint 4, tested), but creating and recalling them is a different tool.
- **Drum pad scroll window, knob redraw, chain selector strip, zone editors,
  Rand/Map** - fidelity to Live's UI for its own sake. `PadScrollPosition`
  geometry is unconfirmed (Q10) and would need a diff nobody needs yet.
- **Automatic macro colours by name** - superseded by the contract, which
  assigns colours explicitly.

---

## Done

What exists, in the order it was built. Detail lives in the code and in
`SCHEMA.md`; this is an index, not a record.

1. **Schema investigation** - Q1..Q24, every finding confirmed against a real
   rack saved by Live.
2. **`adg-codec`** - parse, mutate, serialize. Twenty-one mutations plus the
   contract; the DOM is the source of truth and every read is derived from it.
3. **The editor UI** - Live's layout as one scrolling row: macro knobs, chains,
   devices, nested racks and drum pad grids in place. Pointer drags, never
   HTML5 DnD.
4. **The site** - static, no backend, the `.adg` never leaves the tab.
5. **The device download card** - resolves the newest release carrying a device
   asset, live from the API, with the releases page as fallback.
6. **CI/CD** - lint, typecheck, three suites, Pages deploy, device release.
7. **The Max for Live device** - the same site bundled beside an `.amxd`, with
   two guards on the shipped bytes.
8. **Reading a rack of racks** - a binding on a nested rack's macro belongs to
   the rack ABOVE it (Q22), and an unnamed macro is labelled after what it
   drives (Q23).
9. **Map mode** - binding is modal, every existing cable is drawn while it is
   on, and a nested rack's knob is a mapping source.
10. **The landing page** - open and export first, the walkthrough behind a
    question mark.
11. **The rack features strip** - the contract as two lists and a settings
    column: eight features, templates that carry the convention to the next
    rack, and each feature's state on this rack.
12. **The plugin dependency view** - what a rack needs to load, with names
    resolved by searching the user's own VST3 folder for the class id (Q18).
13. **A macro driving a plugin parameter, visible** - `Binding.plugin`, shown
    and deliberately not editable (Q20).
14. **Save in place** - through a file handle, opt-in, two clicks, with Export
    unchanged beside it.
15. **Offline and installable** - a PWA whose base, scope and start URL all
    come from one env var, so one config serves dev, Pages and the bundle.
16. **A knob the user already made is adopted, not emptied** - the strip asks
    before taking a parameter off somebody's macro.
17. **The phone** - the file picker offers every file (Android filters by MIME
    type and knows no `.adg`), the rack row scrolls with a finger, and a knob
    drag waits for a hold so a swipe stays a swipe.
18. **Beta previews** - a tagged branch published under the deployed site, with
    the site's service worker told to keep off those paths.
