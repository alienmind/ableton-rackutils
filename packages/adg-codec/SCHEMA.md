# .adg Schema Findings

**Status: Phase 2 built** (`packages/adg-codec/src/model.ts`, `mutate.ts`).
Q1, Q2, Q4, Q5, Q7, Q8 independently confirmed against our own three fixtures
(see below), and again by the codec's own test suite (35 tests, 6 of them
against these real files). Q3 holds by structural inference from Q1/Q2, not
from a direct before/after move diff - low risk, see Q3's note. Q6 is
exercised by `moveMapping`'s permutation logic and tested against a real rack
with variations, but the true confirmation - a human loading the output in
Live and checking the variations by eye - hasn't happened yet, see Q6 and
`doc/PLAN.md`'s "How to test" section. Q9 (LOM parameter index) is still open
and is not a file-schema question.

Every element name in the codec must be traceable to a diff recorded here.
Guessing element names produces files that open in Live without complaint and
behave incorrectly - the worst failure mode, since nothing short of a human
checking the result catches it. There is a second, milder failure mode this
session found the hard way: a file that Live refuses to open at ALL, because
it lacked the `<?xml version="1.0" encoding="UTF-8"?>` declaration every
`.adg` starts with. The output was well-formed XML, round-tripped fine through
this codec's own parser, and Live still silently rejected the drag-and-drop.
**Every writer for this format needs that declaration, and the DOM APIs are
inconsistent about supplying one** - see Q12, which is the same line of code
breaking a second time, in the opposite direction.

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
pnpm adg-tool unpack A.adg > A.xml
pnpm adg-tool unpack B.adg > B.xml
diff A.xml B.xml
```

`unpack` normalizes away `Id`, `PointeeId`, `LomId`, `LomIdView` so the diff is
readable. Use `unpack --raw` when you specifically need to see them.

## Fixtures needed

Three structurally different racks, all answers verified against each:

- [x] `simplerack.adg` - Ableton's "Analog" instrument rack, 3 macros mapped
  (Drive, Cutoff, Resonance), no variations
- [x] `withvariations.adg` - same rack, 3 Macro Variations added
- [x] `drum-nested.adg` - Drum Rack -> pad rack -> engine rack, 3 levels of
  `GroupDevicePreset`/`InstrumentGroupDevice` nesting, no macros mapped
- [x] `drum-pads.adg` - an Fx rack containing a Drum Rack with 3 named pads
  (notes 92/91/90, descending in document order) plus Eq8, Compressor2, Delay,
  Reverb and StereoGain alongside it, 3 macros mapped to native-device
  parameters. The only fixture where the drum rack is NOT the root, and the
  one that found Q11.

Still missing: a **move-mapping-with-variations pair produced BY LIVE ITSELF**
(Q6) - `mutate.ts`'s own `moveMapping` has been run on `withvariations.adg`
and tested (see `tests/real-fixtures.test.ts`), but nobody has yet loaded that
output back into Live to confirm by eye. Not currently blocking - see Q6's
note on why.

Fixtures are gitignored. Kept in `tests/fixtures/`.

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

**Confirmed against `simplerack.adg` (Ableton's "Analog"), with one refinement
patchbay's simplified example didn't show:** on an ordinary device parameter
(`MxDFloatParameter`, `MxDEnumParameter` - Ableton's own element names for a
typed, automatable parameter, used by native devices too, not just Max
devices), `LomId`/`KeyMidi`/`Manual`/`MidiControllerRange`/`AutomationTarget`/
`ModulationTarget` are ALL wrapped one level deeper, inside a `<Timeable>`
child of the parameter:

```xml
<MxDFloatParameter>
  <Index Value="11" />
  <Name Value="Filter Drive Amount" />
  <ShortName Value="Drive" />
  <MinValue Value="0" /><MaxValue Value="100" />
  ...
  <Timeable>
    <LomId Value="0" />
    <KeyMidi>
      <NoteOrController Value="0" />
      ...
    </KeyMidi>
    <Manual Value="0" />
    <MidiControllerRange><Min Value="0" /><Max Value="100" /></MidiControllerRange>
    <AutomationTarget><LockEnvelope Value="0" /></AutomationTarget>
    <ModulationTarget><LockEnvelope Value="0" /></ModulationTarget>
  </Timeable>
</MxDFloatParameter>
```

**`MacroControls.N` (the macro itself) has NO `Timeable` wrapper** - its
`LomId`/`Manual`/`MidiControllerRange`/`AutomationTarget`/`ModulationTarget`
are direct children, matching patchbay's description exactly. So the wrapper
is specific to ordinary parameters, not universal.

Practical consequence for `parse.ts`: don't assume `KeyMidi` is always a
direct child of the parameter element. Query for it as a descendant
(`querySelector('KeyMidi')` scoped to the parameter), not `children`.

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
say "this KeyMidi's Macro 3 belongs to rack X" for nested racks.

**Confirmed against `simplerack.adg`:** no id, no pointer, no path string on
any of the 3 mappings found. `NoteOrController` values `0`, `1`, `2` matched
macros 1, 2, 3 exactly, each pointing at a different `MxDFloatParameter` by
plain containment (Drive, Cutoff, Resonance respectively).

## Q3. What changes when a mapping moves from macro 2 to macro 3?

This diff IS the specification for `moveMapping`.

**Answer, follows directly from Q1/Q2:** moving a mapping from macro 2 to
macro 3 is **not** a node move at all. The `KeyMidi` stays on the same target
parameter; only its `NoteOrController` value changes, `1` -> `2`. No id
reconciliation, no element relocation. `moveMapping` in `mutate.ts` should be
close to `keyMidi.querySelector('NoteOrController').setAttribute('Value', to)`.

**Not independently confirmed by a direct move diff** - our fixtures are all
single saves, not a before/after pair with a mapping moved in between. Low
risk to proceed on anyway: Q1/Q2's containment model leaves no other place for
the macro index to live, so there is nowhere else a "move" could act on. The
one thing this doesn't rule out is patchbay's own caveat - Live rewriting
unrelated one-save-lag fields nearby (`MacroDefaults.N`, see Q6) - which
doesn't affect correctness of `moveMapping` itself, only cosmetic fields
this tool already ignores (see `SAVE_NOISE`-style filtering, `normalize.ts`).

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

**Confirmed against `simplerack.adg`:** all 3 mapped parameters carry their
own `MidiControllerRange` (`0..100` for Drive and Resonance, `0..100` for
Cutoff), non-inverted. No inverted range observed in our fixtures - patchbay's
Q26 (Live 12.4.3) remains the only direct evidence for inversion; worth a
dedicated spike later if `bindParameter` needs to support authoring one.

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

**Confirmed against `withvariations.adg`:** 3 `MacroSnapshot` elements
(`Variation 1`/`2`/`3`), each with all 16 `MacroValues.N`/`MacroHasValue.N`.
Slots 0-2 (the 3 mapped macros) carry `true`/absolute values matching that
macro's position at the moment each variation was created (e.g. Variation 1's
`MacroValues.1 = 25.3999996`, matching `MacroControls.1/Manual` exactly);
slots 3-15 (unmapped) carry `false`/`-1`. Exactly as documented.

## Q6. What does Live do to variations when IT moves a mapping?

Repeat Q3 on a rack that has variations. **This defines correct behavior.**
Specifically: what value does the vacated slot receive? 0, 64, the macro's own
default, or is the entry removed?

This answers `DEFAULT_MACRO_VALUE` in `mutate.ts`. Getting it wrong silently
breaks every variation in every rack the tool touches.

**Not answered by patchbay, and our own fixtures don't cover it either** -
`withvariations.adg` has variations but no macro was moved after they were
created. Still genuinely open as a question about what LIVE does.

**Downgraded from blocking spike to post-implementation verification,
reasoning:** the question "what does Live's own move-a-mapping gesture do to
existing variations" matters for *matching Live's output byte-for-byte*, but
it does not gate writing `mutate.ts` at all. `moveMapping` is a file operation
this tool performs - it isn't reproducing a Live UI gesture, it's producing a
correct file directly. What Q1/Q2/Q3 already establish is enough to write it
correctly by construction:

- Moving a `KeyMidi`'s `NoteOrController` from macro 2 to macro 3 does **not**
  touch `MacroSnapshot` on its own (confirmed: it's a different subtree, per
  Q1/Q2's containment model).
- So `mutate.ts`'s `moveMapping` must explicitly permute `MacroValues.N`/
  `MacroHasValue.N` in lockstep across every snapshot - copy the old macro-2
  entry into slot 3, and clear slot 2 (`MacroHasValue.2 = false`,
  `MacroValues.2 = -1`, the confirmed unset sentinel from Q5). This was
  already the plan (`doc/PLAN.md` Constraint 4, `permuteVariations`); Q5
  confirms the exact sentinel and field names to write.
- The open question - whether Live's OWN move gesture does something subtly
  different - only matters for the "byte-for-byte matches Live" test
  (`doc/PLAN.md` §2.6, "matches Live's own output for the same edit"), which
  is a nice-to-have, not `moveMapping`'s correctness bar. Correctness bar is:
  the file loads in Live and the variations show the right values, which is
  directly testable once `mutate.ts` exists, by running it and loading the
  result in Live.

**Do this once `mutate.ts`'s `moveMapping` exists, not before:** run it on
`withvariations.adg`, load the output in Live, click through the 3
variations, confirm the moved macro's value follows correctly and the
vacated slot doesn't drive anything stale. If it doesn't, THIS is the spike to
come back and do for real (move a mapping by hand in Live on a rack with
variations, diff, save as `move-after-live.adg`).

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

**Confirmed against `simplerack.adg`:** `NumVisibleMacroControls Value="8"`,
and all 16 `MacroDisplayNames.N` present (`"Macro 1"` through `"Macro 16"`)
regardless. Exactly as documented.

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

**Confirmed against `drum-nested.adg`:** exactly 3 levels of
`GroupDevicePreset`/`*GroupDevice` nesting - `DrumGroupDevice` (outer Drum
Rack) containing a `GroupDevicePreset`/`InstrumentGroupDevice` (pad rack)
containing another `GroupDevicePreset`/`InstrumentGroupDevice` (engine rack).
No macros were mapped in this fixture, so the macro-to-macro cross-level case
specifically (patchbay S4) is not independently re-confirmed here - the
structural nesting is, which is what this question asked. Low priority to
re-test the macro-to-macro case; patchbay's S4 evidence plus Q1/Q2's
containment model (which doesn't care about depth at all) covers it.

---

## Q13. Where is a chain's colour stored, and is grid position the stored index?

**Answered. A swatch's position in Live's picker IS the number Live stores.**

`MacroColor.N` on the rack device, and `DocumentColorIndex` on a chain, are
indices into Live's 70-colour picker, counted in reading order from 0.

Confirmed against `donors/BS.adg`, whose macro colours were picked by hand and
reported by their author:

| Macro | `MacroColor.N` | Author picked | `livePalette.ts` at that index |
|---|---|---|---|
| 1 (BS SELECT) | 13 | white | `#ffffff` |
| 5 (BS GAIN) | 69 | grey, the LAST swatch in the picker | `#3c3c3c` |

Two points settle it. The last swatch storing 69 in a 70-colour palette rules
out any offset and any reversal; an interior point landing on white at 13 rules
out a row permutation that happened to fix the ends.

So `pnpm adg-palette`'s pixel-sampled grid can be indexed directly, which is
what `macroColor()` already assumed.

**`-1` means no colour set**, not an index. Macro 9 in the same rack stores -1
and reads grey in Live, so the default rendering is grey. `macroColor()` falls
through to a neutral for any index it does not hold, which covers it.

## Q12. Does `XMLSerializer` emit the XML declaration?

Not a question about Ableton's format - a question about the DOM APIs used to
write it, and the second time this one line has broken the tool.

Q1's note and an earlier version of `serializeXmlDoc` both said
`XMLSerializer.serializeToString()` "never emits the `<?xml ... ?>` prolog,
true in every browser and in jsdom". **That is wrong.** Measured directly in
Chromium via a scripted browser:

| Host | `serializeToString` output starts with |
|---|---|
| jsdom (the test environment) | `<Ableton ...` - no declaration |
| Chrome / Chromium (the real app) | `<?xml version="1.0" encoding="UTF-8"?>` |

The codec prepended a declaration unconditionally. Under the tests that gave
exactly one; in a browser it gave two, and a document with a second
declaration does not reparse:

```
malformed XML: error on line 2 at column 6:
XML declaration allowed only at the start of the document
```

`Rack.clone()` reparses, and every mutation clones for undo, so **every edit in
the deployed web app failed** while all 89 tests passed. A saved file would
have carried two declarations and been rejected by Live, exactly the failure
the original prolog fix existed to prevent.

`serializeXmlDoc` now emits exactly one declaration whichever host it runs on:
it prepends only when the serializer did not supply one.

**The general lesson, worth more than the fix:** this codec's rule is that
every element name must trace to a real diff, and that rule was followed here.
The bug was in an assumption about the *environment*, which nothing in the
test suite could contradict because the test suite IS that environment. Where
behaviour differs between jsdom and a browser, only a browser settles it.

---

## Q11. What identifies a bindable parameter?

Asked because the codec got this wrong and only a real fixture showed it. The
UI's arm-a-parameter-then-click-a-macro loop (`doc/PLAN.md` Part 5) needs
to enumerate what a device exposes; the first implementation keyed on Q1's
`Timeable` wrapper and therefore found **zero parameters on every native
Ableton device** - `Eq8`, `Reverb`, `Delay`, `Compressor2`, `StereoGain`,
`OriginalSimpler`, and rack devices themselves all reported an empty list,
while a Max-hosted device reported 61. Mappings were still discovered, because
`collectMacroBindings` walks `KeyMidi` elements directly and never consults
this code - which is exactly why the bug stayed invisible.

**Answer, confirmed against `drum-pads.adg`:** a bindable parameter is an
element that owns an `AutomationTarget`. There are two shapes, and Q1 only
documented the second:

```xml
<!-- Native device (Reverb). No wrapper, no Name child - the TAG is the name. -->
<DecayTime>
  <LomId Value="0" />
  <Manual Value="300" />
  <MidiControllerRange><Min Value="1" /><Max Value="60000" /></MidiControllerRange>
  <AutomationTarget Id="0"><LockEnvelope Value="0" /></AutomationTarget>
  <ModulationTarget Id="0"><LockEnvelope Value="0" /></ModulationTarget>
</DecayTime>
```

The Max-hosted shape (`MxDFloatParameter` etc., Q1) is the same set of children
moved one level down into a `Timeable`, plus an explicit `<Name>`.

So the rule the codec now uses: for each element, the parameter container is
its `Timeable` child if it has one, otherwise the element itself; the element
is a parameter if that container owns an `AutomationTarget`. The display name
is a `<Name>` child when present, otherwise the tag name.

`AutomationTarget` is the right marker rather than `Manual` or
`MidiControllerRange`: it means precisely "Live can automate this", which is
the same set of things a macro can drive.

Consequence worth knowing: a rack device's own `MacroControls.N` and its
`ChainSelector` match this rule, so a NESTED rack enumerates its macros as
bindable parameters. That is correct and load-bearing - an outer macro driving
an inner rack's macro is confirmed real (Q2, Q8, patchbay S4), and it is how
that mapping gets authored.

---

## Q10. How is a drum rack's pad grid represented?

Asked because the UI renders drum racks as their pad grid rather than as a
generic chain list (`doc/PLAN.md` Part 5) - a drum rack used as a bundle
of functions routed per pad is a normal organising pattern, and a flat chain
list throws away the layout the user built.

**Answer, confirmed against `drum-nested.adg`:** a drum rack is a
`DrumGroupDevice`, and its chains sit in the same `BranchPresets` as any other
rack's, but each one is a `DrumBranchPreset` instead of an
`InstrumentBranchPreset`. The pad's note assignment lives in a `ZoneSettings`
child of that branch preset:

```xml
<DrumBranchPreset Id="0">
  <Name Value="" />
  <IsSoloed Value="false" />
  <DevicePresets>...</DevicePresets>
  <ZoneSettings>
    <ReceivingNote Value="92" />
    <SendingNote Value="60" />
    <ChokeGroup Value="0" />
  </ZoneSettings>
</DrumBranchPreset>
```

- `ReceivingNote` is the MIDI note the pad answers to - the pad's identity, and
  what a grid position has to be derived from.
- `SendingNote` is what the chain's instrument receives (Simpler's own note),
  `ChokeGroup` is 0 for none.
- The rack element itself carries `ArePadsVisible` and `PadScrollPosition`
  (`19` in this fixture), plus `DrumPadsListWrapper`/`VisibleDrumPadsListWrapper`
  and `ShowsZonesInsteadOfNoteNames`.

**Not confirmed: the grid geometry.** `PadScrollPosition = 19` against a
`ReceivingNote` of 92 does not fit the obvious reading (rows of 4 counted from
note 0 would put the visible window at 76..91, one short of 92), so do not
derive row/column from it by arithmetic that has not been tested. Read
patchbay `SCHEMA.md` S9 and `ARCHITECTURE.md` §12, which cover pad-to-note
mapping and return chains in depth, then confirm with a diff: scroll a real
drum rack's pad view, save, and see what moves. Until then a pad grid can be
rendered by sorting on `ReceivingNote` without claiming to match Live's exact
scroll window.

Only one pad exists in `drum-nested.adg`, so the multi-pad case (ordering,
gaps where a note has no chain, return chains in `ReturnBranchPresets`) is
unexercised. A fuller drum rack fixture is worth adding before the pad grid is
built.

---

## Q9 (LOM, not file). Macro slot to parameter index

Not answered by diffing. Needed for the companion device's live overlay.

For a rack device, `device.parameters[0]` is Device On and `[1]` is typically
Chain Selector, so macro N is NOT `parameters[N]`. Confirm the offset for each
rack type, especially drum racks, and resolve by NAME rather than assuming a
fixed offset.

**Answer:**

---

## Q14. Does a saved preset carry an external sidechain source?

Asked because the contract (`doc/PLAN.md` 4.3) wants a Gate and a Compressor
option, and the maintainer's own convention routes both to a separate track.

**Answer: no. Live keeps the sidechain switch and drops the routing.**

Confirmed against `donors/PD.adg`, whose Gate and Compressor were BOTH routed
to a separate track in Live when the rack was saved. What the file holds:

```xml
<SideChain>
  <OnOff>
    <Manual Value="true" />          <!-- the switch survives -->
  </OnOff>
  <RoutedInput>
    <Routable>
      <Target Value="AudioIn/None" />
      <UpperDisplayString Value="No Output" />
      <LowerDisplayString Value="" />
    </Routable>
  </RoutedInput>
</SideChain>
```

The whole document contains only `AudioIn/None` and `AudioOut/None` as routing
values, and `No Output` as the only display string. Nothing anywhere else in
the file names a track.

This is what the format should do: a source names a track, and a preset has no
tracks. It is recorded because the opposite is easy to assume from
`UpperDisplayString` being a human-readable name, and because patchbay's notes
on `RoutedInput/Routable` describe the mechanism without saying what survives a
preset save.

**Consequence.** A contract option may insert a Gate or a Compressor, switch
its sidechain on, and bind a macro to it. It may NOT set the source, and the UI
must not imply the routing came across. That stays one manual step per Set.

---

## Q15. A macro can drive the rack's OWN parameters, not only its chains'

Found by running `pnpm adg-tool mappings` on `donors/BS.adg` and noticing that
macro 1, which the author says drives the chain selector, was missing from the
output while macros 2 to 9 were listed.

**Answer: the rack device carries bindable parameters of its own, and
`ChainSelector` is one.** Macro 1's `KeyMidi` sits directly on it:

```
macro 1  <- ChainSelector < InstrumentGroupDevice < Device < GroupDevicePreset
macro 5  <- Gain < StereoGain < Device < AbletonDevicePreset < DevicePresets
```

The second line is the shape every previously recorded binding has: down inside
`BranchPresets`, on a device in a chain. The first is a sibling of
`BranchPresets`, one level up.

**This breaks two assumptions the codec was built on.**

1. `collectMacroBindings()` scans `branchPresetsEl.getElementsByTagName(
   'KeyMidi')`, so a binding on the rack's own parameter is never seen. In
   `BS.adg` the file holds 19 `KeyMidi` elements with `NoteOrController` 0
   through 8, and the codec reports bindings for 1 through 8 only.
2. `owningRackDevice()` establishes ownership by walking up to the nearest
   `BranchPresets` and taking that element's parent's `Device` child. A KeyMidi
   on the rack's own parameter has no `BranchPresets` ancestor within its rack,
   so the walk runs past it and returns null.

Ownership is better established by walking up to the nearest ancestor whose tag
is a group device (`InstrumentGroupDevice`, `AudioEffectGroupDevice`,
`DrumGroupDevice`, `MidiEffectGroupDevice`). That answer is correct for both
shapes and still excludes a nested rack's own macros, which is what the
BranchPresets walk was for.

**Consequence, which is a silent corruption bug.** Every slot-changing mutation
routes through `collectMacroBindings()`. On a rack whose macro drives the chain
selector, `moveMapping` moves nothing while permuting variation values as if it
had, and `reorderMacro`/`swapMacros` leave the `ChainSelector` KeyMidi pointing
at the vacated index, so the chain selector ends up driven by whichever macro
lands there. `unbindMacro` clears nothing and resets the variation value.

A path fix is needed alongside: `pathOf`/`resolveTarget` are rooted at
`BranchPresets`, which cannot address the rack's own parameters at all.

Third time this pattern has held. Q11 was the same lesson: the synthetic
fixture modelled only the shape the codec already assumed.

---

## Q16. What does an `Id` attribute mean?

Asked while inserting a harvested device: what `Id` should the new element get?

**Answer: `Id` is the element's index within its own sibling list, not a
document-wide handle.** Confirmed against `donors/BS.adg`:

```
BranchPresets children          Id = 0, 1
DevicePresets children (chain 0) Id = 0, 1, 2, 3, 4, 5, 6
DevicePresets children (chain 1) Id = 0, 1, 2, 3, 4, 5, 6
everything inside a device       Id = 0
```

The file holds 1318 `Id` attributes and 57 distinct values. 1255 of them are
`0`. The same value repeats freely across different lists, so uniqueness is
per-parent and nothing else.

**This corrects a pre-SCHEMA guess.** `doc/PLAN.md`'s original Phase 2.4 said
to "allocate above the current maximum" and never reuse an id, which was
written before any of this was measured and is the opposite of what Live does.
Following it would have numbered an inserted device somewhere in the hundreds
while its siblings ran 0 to 6.

**Consequence for insertion.** Append the device, then set its `Id` from where
it landed - `siblingCount - 1` - and leave its interior at 0. `maxId()` in
`normalize.ts` survives from the same guess and is not used for insertion.

The elements Ableton regenerates on every save (`Id`, `PointeeId`, `LomId`,
`LomIdView`) are filtered from diffs for readability, which is a separate point
recorded in `doc/PLAN.md` D1. Filtering them does not mean they can be written
carelessly.

---

## Q17. How is a VST3 plugin represented, and are its parameters bindable?

Asked for the plugin dependency view (`doc/PLAN.md` 4.1) and for whether a
macro can drive a plugin parameter. Evidence: `donors/BS-VST3.adg`, a copy of
`BS.adg` with a third chain whose instrument is an Arturia VST3.

**A plugin is NOT an `AbletonDevicePreset`.** It is a sibling wrapper with a
different tag and no `Device` child at all:

```
DevicePresets
  AbletonDevicePreset -> Device -> MidiArpeggiator
  Vst3Preset                              <- no Device child
  AbletonDevicePreset -> Device -> Roar
  ...
```

`Vst3Preset` holds:

| Element | Value in this file | What it is |
|---|---|---|
| `Uid/Fields.0-3` | 1098019957, 1096173907, 1296192084, 1349676899 | the VST3 class UID, four 32-bit ints |
| `DeviceType` | 1 | |
| `ProcessorState` | 77 KB of hex | plugin-internal, opaque |
| `ControllerState` | hex | plugin-internal, opaque |
| `ParameterSettings` | EMPTY | see below |
| `StoredAllParameters` | true | |
| `Name` | `""` | empty |
| `PowerMacroControlIndex` | -1 | |

**There is no plugin name in the file.** `Vst3Preset/Name` is empty and no
other element carries one. The only human-readable string near it is the CHAIN
name, `MiniBrute`, which its author typed. Live resolves the `Uid` against
installed plugins at load time.

**A VST2 or an Audio Unit is some other tag, and which one is not recorded
here.** Every donor with a plugin in it holds a `Vst3Preset`, so that is the
only tag `Rack.plugins` looks for. A rack whose plugin is one of the others
reports no plugins, which is wrong but honest; guessing a tag is how a codec
starts reading elements that do not exist. To settle it: save a rack holding
one of each and diff.

The four `Uid` fields concatenate to `41727475415649534D42525450726F63`, which
decodes as ASCII to `ArtuAVISMBRTProc`. Some vendors build readable UIDs like
that; it is a coincidence to exploit for display, never a fact to rely on.

**The codec sees it, and finds nothing to bind.** `rack.chains` reports the
device as type `Vst3Preset` with **0 parameters**, because parameter discovery
keys on `MidiControllerRange` (Q11) and a plugin exposes none of that.

**Whether a macro can drive a plugin parameter is OPEN.** `ParameterSettings`
is empty here and `StoredAllParameters` is true, which together suggest the
element populates only when parameters are explicitly exposed - Live's
"Configure" mode on a plugin device. Nothing in this file shows what an exposed
parameter looks like, so it cannot be modelled yet.

**To answer it:** in Live, configure two or three parameters on that VST3 so
they appear on the device, map ONE of them to a macro, save, and diff against
this file. That should show both what an exposed parameter looks like and
whether the mapping is the usual `KeyMidi` or something plugin-specific. Until
then the codec must not offer plugin parameters as bindable targets.

---

## Q18. Can a VST3 `Uid` be resolved to a plugin name, client side?

Q17 established that a `Vst3Preset` carries no plugin name, only `Uid/Fields.0-3`.
This is how to turn that back into a name without leaving the browser.

**The `Uid` fields are the VST3 class id, big-endian, concatenated.**
`donors/BS-VST3.adg` stores 1098019957, 1096173907, 1296192084, 1349676899,
which is `41727475415649534D42525450726F63`.

**The class id is embedded in the plugin binary, in COM byte order.** Confirmed
by byte search:

```
Arturia/MiniBrute V.vst3   25,942,368 bytes   COM-ordered id at offset 23,623,120
Arturia/MiniFreak V.vst3   30,341,016 bytes   absent
```

COM order is the usual GUID reshuffle: reverse the first four bytes, then the
next two, then the next two, and keep the last eight as they are. The plain
order did NOT match on Windows. The VST3 SDK is not COM-ordered on every
platform, so an implementation has to search for BOTH forms.

**What does not work here.** The documented portable route is
`moduleinfo.json`, which the VST3 SDK can ship inside a plugin bundle's
`Resources` folder listing every class id and its name. On this Windows machine
there are zero of them: every `.vst3` under `Program Files/Common Files/VST3` is
a single DLL, not a bundle. It is opt-in for vendors and none of these took it.
Do not build on it as the primary path.

**Consequence: resolution is a byte search over the user's own plugin folder.**
`showDirectoryPicker()` gets read access once, each `.vst3` is streamed and
searched for the 16 bytes in either order, and the FILENAME is the answer -
`MiniBrute V.vst3`. Pure client side, no native code, no registry, no network.

Two things make it cheap enough. The result is a `uid -> name` table worth
caching, so the scan happens once rather than per rack. And a MISS is a useful
answer in its own right: a rack naming a class id no local plugin contains is a
rack this machine cannot fully load, which is the question the dependency view
exists to answer.

Limits worth stating in the UI: it only sees plugins installed on the machine
doing the looking, `showDirectoryPicker` is Chromium-only today, and a plugin
that ships several classes resolves them all to one filename.

---

## Q19. What visible macro counts does Live accept, and what makes a rack render tall?

Found by loading a rack this codec wrote into Live: it worked, and it drew
noticeably taller than any hand-built rack beside it.

**Two causes, both ours.**

**1. `NumVisibleMacroControls` should be EVEN.** The generated rack carried 11.
Every rack Live wrote carries an even number - `BS.adg` and `BS-VST3.adg` 10,
`PD.adg` 16 - and Live's own +/- buttons step by two, which is already recorded
in `doc/PLAN.md` D3 as a UI rule without anyone noticing it was also a file
rule. An odd count loads without complaint and draws the macro grid wrong.

`insertMacroSlots` now rounds the new count up to even.

**2. A long macro name wraps onto a second line**, and the taller cell takes
the whole rack with it. The generated names were 21 characters
(`AlienMind Bass FILTER`) because the contract expanded `{name}` from the
rack's own name. Hand-built racks here top out at 12 (`Pluck / Long`,
`GATE ON/OFF`) and sit on one line.

The exact wrap threshold is not established - it is a rendered text width, not
a character count, and no diff can measure it. What is established is that 12
fits and 21 does not. `applyContract` takes the label name explicitly now, so
the short track code the convention is built on (`BS GAIN`) is the path of
least resistance rather than an override.

Neither is a corruption: the file is valid and the mappings work. It is a
reminder that "loads in Live" is not the same as "looks like a rack", and only
opening it answers the second one.

---

## Q20. How is a plugin parameter exposed, and how does a macro drive it?

Evidence: `donors/BS-EQ3.adg`, where one parameter of the Arturia VST3 was
exposed through Live's Configure mode.

**Exposing a parameter fills `ParameterSettings`**, which Q17 found empty:

```xml
<ParameterSettings>
  <PluginParameterSettings>
    <Index Value="0" />
    <VisualIndex Value="0" />
    <ParameterId Value="70" />              <!-- the plugin's own id -->
    <Type Value="PluginFloatParameter" />
    <MacroControlIndex Value="-1" />        <!-- the macro, -1 when unmapped -->
    <MidiControllerRange />
    <LomId Value="0" />
  </PluginParameterSettings>
</ParameterSettings>
```

**A plugin parameter is NOT driven by a `KeyMidi`.** Everything recorded in Q1
through Q15 - `KeyMidi` with `Channel` 16 and `NoteOrController` carrying the
macro index - applies to Ableton devices. A plugin carries an integer
`MacroControlIndex` on the exposed parameter instead. `Vst3Preset` also carries
`PowerMacroControlIndex` for its own on/off, the same shape, and no Ableton
device in any donor has that element.

**Confirmed against `donors/BS-VST3-mapped.adg`**, the same rack with that
parameter mapped to macro 13:

```xml
<PluginParameterSettings>
  <ParameterId Value="70" />
  <Type Value="PluginFloatParameter" />
  <MacroControlIndex Value="12" />     <!-- 0-based: macro 13 -->
  <MidiControllerRange>
    <MidiControllerRange>             <!-- nested twice, and only once mapped -->
      <Min Value="0" />
      <Max Value="1" />
    </MidiControllerRange>
  </MidiControllerRange>
  <LomId Value="1232" />              <!-- non-zero once mapped -->
</PluginParameterSettings>
```

Three things the mapped state adds: `MacroControlIndex` holds the 0-based macro
index, the range appears as a `MidiControllerRange` nested inside another
`MidiControllerRange` rather than the flat one an Ableton parameter uses (Q4),
and `LomId` becomes non-zero.

**Consequence, which was a real bug and is now fixed.**
`collectMacroBindings()` finds `KeyMidi` elements and cannot see a plugin
mapping, so every slot-changing mutation left the index pointing at the vacated
slot. `Rack.collectPluginMacroRefs()` collects these separately and
`moveMapping`, `swapMacros`, `insertMacroSlots` and `unbindMacro` all carry
them now. Two details:

- `moveMapping` used to refuse outright on a macro with no `KeyMidi`, which is
  exactly what a macro driving only a plugin parameter looks like.
- Unbinding writes -1 rather than removing the element. The parameter stays
  exposed on the device, it just stops being driven.

**The editor shows these now.** `Binding` carries an optional `plugin`
(`uid`, `parameterId`, `power`) and its `targetPath` addresses the element
holding the macro index rather than a parameter, which is what a plugin binding
has instead of one. Two consequences the UI has to respect:

- **The range is the plugin's, not the parameter's.** It reads 0..1 - the
  plugin's normalized value - and it sits in a `MidiControllerRange` nested in
  another one. An Ableton-shaped range written there is a file that loads and
  behaves wrong, so `setBindingRange` and `invertBindingRange` refuse a plugin
  path by name and the table shows those two numbers without an input on them.
- **Unbinding writes -1**, as `unbindMacro` already did: the parameter stays
  exposed on the device.

**What a mapped POWER switch looks like has still not been seen.**
`PowerMacroControlIndex` is -1 in every donor, beside a flat
`PowerMacroMappingRange` of 64..127. That element is read as the range for a
power binding, which is an inference from its name and its shape rather than
from a diff. To settle it: map a plugin's on/off to a macro, save, and diff.

## Q21. What is EQ Three, and what are its band gains?

`FilterEQ3`, confirmed in `donors/BS-EQ3.adg` where its three band gains are
mapped to macros 10, 11 and 12:

| Parameter | Range |
|---|---|
| `GainLo` | 0.0003162277571 .. 1.99526238 |
| `GainMid` | same |
| `GainHi` | same |

Linear amplitude, not decibels, which is the usual trap when a contract wants
a range in a unit a human recognises.

This was the last contract option with no donor and no known tag. `pnpm
adg-harvest` now lifts it, so all five options in `doc/PLAN.md` 4.3.2 have one.


---

## Q22. Who owns a `KeyMidi` on a nested rack's `MacroControls.N`?

Found on `donors/KD.adg`, a drum rack whose four pads each hold a rack. Live
draws its macro 4 as `KICK SEL`, mapped; the editor drew it as an empty slot
with a default label, while the mapping table listed the mapping under the
nested rack. Both were reading the same file.

**Answer: the rack ABOVE the one the element sits in.** A parent macro drives a
child rack's macro by a `KeyMidi` on the child's own `MacroControls.N`:

```
root macro 4  <- MacroControls.1 < InstrumentGroupDevice "AlienMind KD Kick Selector"
                                 < Device < GroupDevicePreset < DevicePresets
                                 < DrumBranchPreset "Kick" < BranchPresets
```

`owningRackDevice()` walks up to the nearest `GroupDevicePreset`, which here is
the CHILD's, so every one of these was credited to the child. On this rack that
is six of the root's ten macros.

**`ChainSelector` on the same device element goes the other way**, and the same
file proves it: the child's own macro 2 (`KICK SEL`, colour 13) drives the
child's `ChainSelector`, exactly the shape Q15 recorded on `BS.adg`. So the
disambiguator is the PARAMETER, not the depth:

| Parameter of a rack device | Owner |
|---|---|
| `MacroControls.N` | the rack above it |
| everything else (`ChainSelector`, ...) | the rack itself |

The rule behind it: a macro cannot drive its own rack's macro. There is nothing
for such a mapping to mean, so a `KeyMidi` on `MacroControls.N` can only have
come from the level above.

**Consequence.** The same family of silent corruption as Q15: every
slot-changing mutation routes through `collectMacroBindings()`, so on a rack
of racks - the shape a drum rack always has - `moveMapping` moved nothing while
permuting variation values as if it had, and `reorderMacro` left the parent's
bindings on the vacated index.

---

## Q23. What does Live show on a macro that has no name?

Same rack, same screenshot. `donors/KD.adg`'s root carries
`MacroDisplayNames.4` through `.8` at their defaults (`Macro 5` ... `Macro 9`)
and Live labels those knobs `Rumble Length`, `Rumble Reverb`, `Rumble Drive`,
`Rumble Freq` and `Atmo Gain`.

**Answer: an unnamed macro is labelled with the name of what it drives.** Each
of those five is the name of the child rack macro at the other end of the Q22
binding. Macro 4 is the same case with a colour of its own: default name,
`MacroColor.3 = 13`, drawn white and labelled `KICK SEL` after the child macro
it drives.

The default is recognisable rather than empty: `Macro ${index + 1}`, exactly
what `MacroDisplayNames.N` holds when nobody has renamed the slot, which is
also what the empty slots of `BS.adg` carry.

A macro driving several parameters is normal (Q1), and what Live labels one of
those has not been checked against a rack that has one. The editor shows the
first target's name; every macro in this rack drives exactly one thing, so the
screenshot does not settle the multi-target case.

---

## Q24. What makes a chain selector actually select?

Asked because the chain select feature wrote a macro that moved and changed
nothing: every chain stayed audible at every position of the knob.

**Answer: each chain carries a `BranchSelectorRange`, and they have to
partition 0..127.** From `donors/KD.adg`'s Kick rack, eight chains:

```xml
<InstrumentBranchPreset>
  <BranchSelectorRange>
    <Min Value="0" />           <!-- chain 0 -->
    <Max Value="15" />
    <CrossfadeMin Value="0" />
    <CrossfadeMax Value="15" />
  </BranchSelectorRange>
  <ZoneSettings>...</ZoneSettings>
```

`0-15`, `16-31`, ... `112-127`: 128 divided by the chain count, no gaps and no
overlap. **The crossfade edges sit flush with the range**, which is what makes
it a selector rather than a blend - Live fades between chains across the
crossfade region, and there is none here.

Written by `distributeChainSelector`, which the chain select feature calls
before binding its macro. It leaves a rack whose chains already hold DIFFERENT
ranges alone: a layered instrument whose chains overlap on purpose is somebody
else's design, not a mistake to correct.

**A drum rack is the trap.** `DrumGroupDevice` carries a `ChainSelector`
element of its own - the file allows binding it - and its pads are chains. But
a pad answers to a note, not to a selector position, so a chain selector on the
drum rack itself is a control that loads and does nothing. What a drum rack
wants is what `KD.adg` does by hand: a pad holds a rack, one of THAT rack's
macros drives ITS chain selector, and the drum rack's macro drives that macro
(Q22). The feature therefore takes a target rack, and the UI offers the pads
rather than the drum rack itself.
