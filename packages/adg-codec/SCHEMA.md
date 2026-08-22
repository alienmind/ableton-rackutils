# .adg Schema Findings

**Status: Q1-Q8 answered, borrowed from `alienmind/patchbay`'s own schema work
(Live 12.4.3, extensively verified there with real Live saves). Not yet
independently re-verified against our own fixtures - do that before trusting
this for anything destructive. Q9 (LOM parameter index) is still open, it is
not a file-schema question.**

Every element name in the codec must be traceable to a diff recorded here.
Guessing element names produces files that open in Live without complaint and
behave incorrectly, which is the worst available failure mode.

`alienmind/patchbay` (`doc/ARCHITECTURE.md` §5-11 and `doc/SCHEMA.md` S3-S10)
documents this in far more depth than repeated below: transfer-function
derivations, the full `MacroDefaults` lag investigation, `.als` track
structure, drum rack pad mapping. Read it directly for anything not covered
here. Its racks are `.adg`/`.adv`, the same format this tool targets, so its
findings transfer directly - they still need our own confirming diff before
`mutate.ts` relies on them, per this project's own rule.

## Procedure

```bash
# 1. Save a rack as A.adg
# 2. In Live, make exactly ONE change
# 3. Save as B.adg
pnpm adg-inspect unpack A.adg > A.xml
pnpm adg-inspect unpack B.adg > B.xml
diff A.xml B.xml
```

`unpack` normalizes away `Id`, `PointeeId`, `LomId`, `LomIdView` so the diff is
readable. Use `unpack --raw` when you specifically need to see them.

## Fixtures needed

Three structurally different racks, all answers verified against each:

- [ ] `simple.adg` - instrument rack, a few mapped macros, no variations
- [ ] `with-variations.adg` - same, plus at least 3 Macro Variations
- [ ] `drum-nested.adg` - drum rack, pad rack, Pitch, engine rack (3 levels)

Fixtures are gitignored. Keep them in a local `tests/fixtures/`.

---

## Q1. Where does a macro's mapping live?

Change a macro from unmapped to mapped. Diff.

**Answer (patchbay S3):** a `KeyMidi` element, inserted as a child of the
**target parameter**, not the macro. Written lazily - absent until mapped, so
counting `KeyMidi` elements counts mappings. A macro's display name and value
say nothing about whether it is mapped: a macro can sit at its default name
and value `0` while genuinely wired to something.

```xml
<PreDrive>
  <LomId Value="0" />
  <KeyMidi>
    <PersistentKeyString Value="" />
    <IsNote Value="false" />
    <Channel Value="16" />
    <NoteOrController Value="0" />
    <LowerRangeNote Value="-1" />
    <UpperRangeNote Value="-1" />
    <ControllerMapMode Value="0" />
  </KeyMidi>
  <Manual Value="0" />
  <MidiControllerRange><Min Value="-36" /><Max Value="36" /></MidiControllerRange>
  ...
</PreDrive>
```

Live implements macros as MIDI CC on a virtual channel: `Channel` is always
`16` (the macro bus, fixed regardless of macro index or nesting depth),
`IsNote` is `false`, `ControllerMapMode` is `0` (absolute), `PersistentKeyString`
is empty. `NoteOrController` is the payload, see Q2.

## Q2. How is the mapping target identified?

By id reference, by path string, or both? Determines whether moving a mapping
is a cheap node move or requires rewriting references.

**Answer (patchbay S3, S3b): neither.** The target is named by **containment**
- the parameter that owns the `KeyMidi` block is the mapped one. There is no
id, no pointer, no path string anywhere in the mapping.

`NoteOrController` on that `KeyMidi` is the **macro index, zero-based** (`0` =
Macro 1). Confirmed three times (S3b, S4, S10) across different racks and
nesting depths.

This is a materially different, and much cheaper, model than the plan's
original `Binding.targetId` assumed (`doc/PLAN.md` Part 2.2) - there is no id
to look up or reconcile. It also means macro mappings **survive a naive
subtree copy**: duplicating a chain duplicates its `KeyMidi` blocks, and each
copy correctly refers to its own new parent's macros (patchbay
`ARCHITECTURE.md` §5, "Why this matters for cloning"). `doc/PLAN.md`'s Phase 2
model needs revising before it's implemented - see the note at the top of
Part 2.2 there.

Which RACK owns "Macro N" is not stored either; it is resolved structurally
(walk up to the nearest `BranchPresets`, then that parent's `Device`/`*GroupDevice`
- patchbay `ARCHITECTURE.md` §3). Our tool only needs this if it ever has to
say "this KeyMidi's Macro 3 belongs to rack X" for nested racks; confirm
against our own fixture before relying on it.

## Q3. What changes when a mapping moves from macro 2 to macro 3?

This diff IS the specification for `moveMapping`.

**Answer, follows directly from Q1/Q2:** moving a mapping from macro 2 to
macro 3 is **not** a node move at all. The `KeyMidi` stays on the same target
parameter; only its `NoteOrController` value changes, `1` -> `2`. No id
reconciliation, no element relocation. `moveMapping` in `mutate.ts` should be
close to `keyMidi.querySelector('NoteOrController').setAttribute('Value', to)`.

Not yet confirmed against our own fixture: whether Live additionally rewrites
anything else on that save (patchbay's own `MacroDefaults` investigation found
several one-save-lag fields nearby - see Q6/`MacroDefaults.N` below). Verify
with a real before/after diff before trusting this is the *complete* set of
changes.

## Q4. Where are range and inversion stored?

Set a non-default mapping range. Separately, invert it (min > max). Two diffs.

**Answer (patchbay S10, ARCHITECTURE.md §5, Q26):** `MidiControllerRange`
(`Min`/`Max`) on the **target parameter** - the same element `KeyMidi` lives
on, not on the macro. Confirmed writable and load-bearing by a reverse test:
narrowing a target's `MidiControllerRange/Max` narrows what the macro can
reach.

**Inversion works: `Min > Max` is honoured**, and the knob runs backwards
(verified in Live 12.4.3 on a real device, patchbay Q26). This is one of two
capabilities (with the range itself) that exist in the file format but have
**no UI to author them** - Live 12.4.3's macro right-click menu has no range
editor at all. A generator can do things the GUI cannot.

The transfer function, needed for both directions:

```
value = Min + (macro / 127) * (Max - Min)
macro = (value - Min) / (Max - Min) * 127
```

Macro values are **continuous** (e.g. `63.5`), not integer CC steps.

## Q5. Where are variations stored, and how are they keyed?

Build a rack with 3 variations, diff against the same rack with 2. Confirm the
per-macro value array is positional.

**Answer (patchbay S8):** `MacroVariations/MacroSnapshots/MacroSnapshot`, a
positional list on the rack device (`Id` = list position, `0`, `1`, ...). Each
`MacroSnapshot` always writes all 16 macro slots, regardless of the rack's
visible macro count:

```xml
<MacroSnapshot Id="0">
  <AutogeneratedNameIndex Value="1" />
  <SnapshotName Value="Variation 1" />
  <MacroValues.0 Value="69" />       <!-- x16 -->
  <MacroHasValue.0 Value="true" />   <!-- x16 -->
</MacroSnapshot>
```

- `MacroValues.N` is on the **macro's own 0..127 scale**, not normalized -
  confirmed by matching a snapshot's stored value against that same file's
  live `MacroControls.N/Manual`.
- `MacroHasValue.N` carries whether slot N participates. Unmapped slots are
  `false` with a `-1` sentinel value, matching the `-1` unset sentinel used
  elsewhere (`MacroDefaults.N`).
- A snapshot is a **copy taken at the moment "New" is clicked**; it does not
  track the macros afterward. A rack's current macro values say nothing about
  its variations.
- Confirmed round-trippable: patchbay rewrote every `MacroSnapshot` in a real
  file through its own writer and diffed **zero facts** against Live's
  original.

## Q6. What does Live do to variations when IT moves a mapping?

Repeat Q3 on a rack that has variations. **This defines correct behavior.**
Specifically: what value does the vacated slot receive? 0, 64, the macro's own
default, or is the entry removed?

This answers `DEFAULT_MACRO_VALUE` in `mutate.ts`. Getting it wrong silently
breaks every variation in every rack the tool touches.

**Not answered by patchbay - this is the one real gap.** Its dataset never
combined "rack has saved variations" with "a mapping's macro slot changes";
S3b's macro moves happened before any variations existed on that rack. Still
open, still needs our own before/after diff. What Q2/Q3 do establish: since
moving a mapping only edits `NoteOrController` on the target's `KeyMidi` and
never touches `MacroSnapshot` at all, an existing snapshot's `MacroValues.1`/
`MacroValues.2` are **not automatically rewritten by the move itself** - which
is exactly Constraint 4's danger (stale value lands on the wrong slot) and
confirms it's real, but doesn't say what Live's UI additionally does to
compensate, if anything. Test directly.

Save the resulting file as `tests/fixtures/move-after-live.adg`. The strongest
test available is asserting our output matches Live's own for the same edit.

## Q7. Where is the macro count stored?

Live 11+ allows 1..16 visible macros per rack. Do not hardcode 8.

**Answer (patchbay S10, ARCHITECTURE.md §6):** `NumVisibleMacroControls` on
the rack device, a single integer fact. Changing the visible count (8 -> 16 in
Live's UI) changes **only this one fact and adds no elements** - all 16 macro
slots (`MacroControls.N`, `MacroDisplayNames.N`, `MacroDefaults.N`,
`MacroAnnotations.N`, `MacroColor.N`, `ForceDisplayGenericValue.N`,
`ExcludeMacroFromRandomization.N`, `ExcludeMacroFromSnapshots.N`) exist in
every rack regardless of visible count. A generator always writes all 16 and
sets the count separately.

Note the UI/XML vocabulary split: the UI says "Variations", the XML family is
`ExcludeMacroFromSnapshots`/`MacroSnapshots`. Grepping the UI word finds
nothing.

## Q8. How is nesting represented?

Drum Rack, pad rack, Pitch, engine rack. Is the recursion uniform at each
level, or does the drum rack differ?

**Answer (patchbay S4, ARCHITECTURE.md §5 "Macro-to-macro is not a special
case"):** uniform. Mapping an outer rack's macro to an inner rack's macro (or
to its `ChainSelector`) uses the *identical* `KeyMidi`-on-target mechanism;
`Channel` stays `16` at every depth, so **nesting depth is not encoded in the
mapping at all** - depth is purely structural (where the parameter node sits
in the tree), not a field anywhere in the `KeyMidi`. Confirmed 3 levels deep
(`DrumGroupDevice` -> `InstrumentGroupDevice` -> `InstrumentGroupDevice`) in a
real file.

Drum racks specifically are covered in more depth in patchbay `SCHEMA.md` S9
and `ARCHITECTURE.md` §12 (pad-to-note mapping, return chains, sends) - read
those directly if `editor-ui`'s device tree needs to special-case drum pads.

---

## Q9 (LOM, not file). Macro slot to parameter index

Not answered by diffing. Needed for the companion device's live overlay.

For a rack device, `device.parameters[0]` is Device On and `[1]` is typically
Chain Selector, so macro N is NOT `parameters[N]`. Confirm the offset for each
rack type, especially drum racks, and resolve by NAME rather than assuming a
fixed offset.

**Answer:**
