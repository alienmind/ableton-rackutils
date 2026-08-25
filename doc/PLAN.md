# ableton-rackutils: Implementation Plan (v6)

**Product status: v0.2.0, beta.** The editor works end to end, and racks the
contract authored have been loaded back into Live. Still young: keep backups.

Canonical plan for `ableton-rackutils`, a toolkit for Ableton rack preset
(`.adg`) files. Lives in the repo so the project is self-contained: clone it
and everything needed to continue is here.

Companion docs:
- `doc/DEVELOPERS.md` - setup, repo layout, how to test, the pipeline. The
  practical entry point; this document is the reasoning behind it. (`README.md`
  is for people using the tool, not building it.)
- `packages/adg-codec/SCHEMA.md` - the schema findings log, confirmed against
  real fixtures, that all codec code must trace to.
- `.github/workflows/` - CI, Pages deploy, device release.

Handoff document. Written so another agent can pick this up cold. Read Part 2
before writing any code: several intuitive designs are ruled out by facts about
Ableton's API and about the file format that are not obvious.

What is already built is in the DONE section at the end, stated as outcomes.
Everything between here and there is work not yet done. Ideas considered and
dropped are in Parked, so nobody digs the same hole twice.

---

## What this is for

**Two jobs, one file format.**

**Job 1, built: reorganize the macros of a rack you already have.** Live has no
way to move a mapping from macro 2 to macro 3, or to swap two macros. Its Macro
Mappings panel shows you every mapping and lets you edit ranges, and gives you
no way to move one. That gap is the reason this tool exists and it is the only
part with an unarguable value proposition.

**Job 2, the direction: author a rack to a contract.** A producer with one rack
per track wants those racks to present the same interface: a gain macro always
in the same slot, always named the same way, always the same colour. Live
offers nothing for this, so it is done by hand, per rack, and drifts. The tool
can materialize a convention instead: pick the pieces of the contract, and the
rack comes out conforming.

The two compose. Job 2 authors the rack, Job 1 adjusts it afterwards.

Everything else considered - session scaffolding, a DSL front end, live LOM
editing, batch library operations - is out. See Parked.

---

## Current state

- **`packages/adg-codec`** - built. Thirteen mutations, 88 tests, 18 of them
  against four real racks.
- **`packages/editor-ui`** - built. Reproduces Live's layout, 24 tests.
- **`apps/site`** - the editor plus a getting-started guide, deployed to Pages.
  22 Playwright specs against real Chromium in CI.
- **`tools/adg-tool`** - `unpack`/`diff`/`mappings`/`move`/`move-mapping`, plus
  `adg-palette`.
- **`apps/m4l-device`** - scaffold. Builds and installs a real `.amxd`, bridge
  alive, no editor UI wired in. The site presents it as "Soon!", never as a
  working download.
- **`.github/workflows/`** - CI (both jobs), Pages deploy, device release.
  Green.

## Next steps, in order

1. **The options strip UI** (4.3.1). The contract's codec side is built,
   tested, and confirmed in Live. What is missing is the surface that drives
   it: tick an option, see it land.
2. **VST dependency view** (4.1). The resolution route is settled (SCHEMA.md
   Q18): pick the plugin folder once, byte-search each `.vst3` for the class
   id, cache the answer.
3. **Editor open items** (4.4), cables on selection first.
4. **Save in place** (4.6), then the device bundle (4.7).

Use it on real racks throughout. Every bug this project has hit came from that,
not from tests - including a UI whose every interaction was broken while its
whole suite passed (SCHEMA.md Q12).

Default to a read-only or simulated mode for anything that writes over a user's
file. The site downloads a copy and never touches the original.

### The test that matters is not automated

Run a mutation, drag the result into Live, and look. Do it especially on a rack
with Macro Variations (SCHEMA.md Q6), and on every new device type the contract
learns to insert. Three real bugs so far were invisible to the synthetic suite
and one was invisible to the whole headless suite; see `doc/DEVELOPERS.md` for
what each one was. Two rules came out of them:

- Test against the real fixtures, not only synthetic ones. A synthetic fixture
  written from the codec's own assumptions agrees with the codec's own bugs.
- Run `pnpm test:e2e` whenever a change touches serialization, pointer
  handling, or layout. jsdom is not a browser.

---

## Part 1: What the user actually does

### The product in one sentence

Load a saved Ableton rack preset (`.adg`), see it drawn the way Live draws it,
reorganize its macros or apply a contract to it, save the result, load it back
in Live.

### The shape of the product

**A website. The device is the same website, bundled to run offline inside
Live.**

The website is the product. It is a static site on GitHub Pages. No account, no
upload, no backend. The `.adg` is parsed, edited, and rebuilt entirely in the
browser tab, and never leaves the machine. That last point is worth saying out
loud on the landing page, because "drag your project files into a website"
otherwise sounds alarming, and here it happens to be literally true that
nothing is transmitted.

The Max for Live device adds no editing capability. It is a convenience: the
same app, bundled, so it is reachable from inside Live with no browser and no
network. Nothing about it is mandatory and nothing in the editor may depend on
it.

### The workflow

1. In Live, save the rack to disk: click the disk icon in the rack's title bar,
   or drag the rack into the browser. This produces an `.adg` in the User
   Library. Required, see Constraint 2.
2. Open the site, or the device's window. Drag the `.adg` onto it.
3. The rack renders the way Live draws it. Reorganize macros, or apply contract
   options.
4. Save. The browser downloads the modified `.adg`, or writes it in place where
   the File System Access API is available (4.6).
5. In Live, drag the file onto the rack to reload it.

Steps 1 and 5 are permanent. There is no API to save a rack preset to disk and
no reliable way to script a hotswap, so both stay manual. See Parked.

### What this tool cannot do

- It cannot change mappings on a rack live, in place, while Live is running.
  Every edit goes through the file. Constraint 1.
- It cannot find the rack's file automatically. Constraint 2.
- It cannot save the rack out of Live for you, or reload it for you.
- It will not preserve mappings made after the rack was last saved to disk. The
  file is the source of truth.
- It cannot invent a device. Constraint 7.

---

## Part 2: Constraints

These are the load-bearing facts. Do not design around them without
re-verifying them first.

### Constraint 1: Mapping targets are not exposed to code

The Live Object Model exposes a macro's current value as a `DeviceParameter`,
and that value is observable. It does not expose which parameter a macro
drives. Not through Max's `LiveAPI`, not through a Python Remote Script, not
through AbletonOSC (whose own docs list `RackDevice` and `Chain` as
incompletely exposed).

State this as "not exposed to code", never as "the mapping exists only in the
file". Live plainly knows it at runtime and shows it: right-click a macro knob
and the context menu reads "Remove Mapping to \<rack\> | \<chain\> |
\<parameter\>", naming the target exactly. The limit is the API surface, not
Live's knowledge.

Consequence: creating, moving, or deleting a binding is a file operation. There
is no live API call for it. Everything in this plan follows from that, and it
is why the device cannot read a rack that has not been saved.

### Constraint 2: A live device has no pointer to its source file

Once a rack is on a track it is part of the Live Set's state, serialized into
the `.als`. There is no `device.file_path` property. Two devices loaded from
the same preset, then edited differently, are indistinguishable by origin.

Consequence: the user must explicitly save the rack to disk, and must
explicitly choose the file. A filename-based guess can be offered as a
suggestion. It must never auto-load, because a stale file with a matching name
is worse than no file.

### Constraint 3: Macro index is not LOM parameter index

For a rack device, `device.parameters[0]` is Device On. `parameters[1]` is
typically Chain Selector. Macros follow after that, and the offset is not
guaranteed stable across rack types.

Only matters if the device ever reads live parameter values, which is not
currently planned. Recorded so it is not rediscovered.

### Constraint 4: Macro Variations are indexed by macro slot

A rack's variations store a snapshot of values per macro index. Moving a
binding from macro 2 to macro 3 without permuting the stored variation values
silently breaks every variation in the rack: the old macro-2 value is written
to a now-unmapped slot, and macro 3 drives the moved parameter with an
unrelated stored value.

Consequence: every mutation that changes macro slots must permute variation
value arrays identically. This is the single easiest way to corrupt a rack, and
the codec tests it explicitly.

### Constraint 5: A parameter can only be driven by one macro

Live enforces this in its UI. The file format allows expressing a violation.
Mutations must clear the previous owner when rebinding.

### Constraint 6: Macro count is 1 to 16, configurable per rack

Since Live 11 the visible macro count is adjustable. Do not hardcode 8 or 16.

### Constraint 7: Device XML cannot be generated, only copied

A stock Live device is hundreds of facts in the file. `Eq8` is 51 KB on its
own; patchbay measured a Reverb at around 800 facts. Nothing can write one from
a description, and a device assembled from imagination produces a file that
loads without complaint and behaves wrong.

Consequence: anything that ADDS a device to a rack needs a donor - a real
instance, saved by Live, to copy from. This is patchbay's central finding
(`donors/README.md`) and it governs the whole of 4.3. It is also why the
contract's device list grows one hand-authored donor at a time rather than by
writing code.

### Verification status

Constraints 1 and 2 are well established. Constraints 4, 5 and 6 are confirmed
in the file format by SCHEMA.md Q5, Q1 and Q7. Constraint 7 is confirmed by
inspection of patchbay's donor set. Constraint 3 is a LOM fact and stays
unverified because nothing currently needs it.

---

## Part 3: Repo layout

Monorepo, pnpm workspaces.

```
ableton-rackutils/
  packages/
    adg-codec/          # parse, mutate, serialize .adg. Zero UI deps.
    editor-ui/          # shared React components. Zero Ableton deps.
  apps/
    site/               # the product. Static, deployed to GitHub Pages.
    m4l-device/         # the same site, bundled into an .amxd
  tools/
    adg-tool/           # CLI for schema investigation and codec exercise
```

Rules that keep the pieces honest:

- `adg-codec` must not import React, and must run identically in Node (for
  tests) and browser.
- `editor-ui` must not import anything from `@m4l-jweb`. The device adds no
  capability, so no component may branch on whether it is present.
- `apps/site` must never import from `apps/m4l-device`. The site has to build
  and deploy with the device removed entirely.

The build must stay a pure static build. No server-side rendering, no API
routes, nothing that assumes a Node process at runtime.

---

## Part 4: Open work

### 4.0 Fix: bindings on the rack's own parameters are invisible

**A correctness bug in shipped code, found in `donors/BS.adg`. Do this first.**

A macro can drive a parameter of the rack device itself, not only parameters of
devices inside its chains. `BS.adg`'s macro 1 drives `ChainSelector`, whose
`KeyMidi` sits as a sibling of `BranchPresets` rather than inside it. Full
evidence in SCHEMA.md Q15.

`collectMacroBindings()` scans inside `BranchPresets` only, so it never sees
that binding, and `owningRackDevice()` cannot attribute it either. Every
slot-changing mutation routes through both. On a rack like this one:

- `moveMapping` moves nothing while permuting variation values as if it had.
- `reorderMacro` and `swapMacros` leave the `ChainSelector` binding on the
  vacated index, so the chain selector ends up driven by whichever macro lands
  there.
- `unbindMacro` clears nothing and resets the variation value.

The editor offers all of these on macro 1 today.

The fix has three parts:

1. Scan for `KeyMidi` from the rack device element, not from `BranchPresets`.
2. Establish ownership by walking up to the nearest group-device ancestor
   (`InstrumentGroupDevice`, `AudioEffectGroupDevice`, `DrumGroupDevice`,
   `MidiEffectGroupDevice`) instead of via `BranchPresets`. Correct for both
   shapes, and still excludes a nested rack's own macros.
3. Root `pathOf`/`resolveTarget` at the rack device rather than at
   `BranchPresets`, since a path relative to `BranchPresets` cannot address the
   rack's own parameters at all. This touches every stored path, but paths are
   runtime-only and never persisted.

Test against `BS.adg`: 19 `KeyMidi` elements, `NoteOrController` 0 through 8,
and the codec must report bindings for all nine macros rather than eight.

### 4.1 VST dependency view

**Build this first.** Read-only, no donors, no insertion, no ambiguity, useful
on its own.

Walk the rack for plugin devices and list the unique plugins it needs:
`PluginDevice`, `Vst3PluginInfo`, `VstPluginInfo` and the Audio Unit
equivalents, each carrying a plugin name and a unique id. Show them as a strip
above the rack.

It answers a question nothing else answers: will this rack load on this
machine, and what does it drag in. Useful for a rack downloaded from elsewhere,
and for an old rack of your own built on a plugin you have since removed.

The schema is settled (SCHEMA.md Q17, Q18). A plugin is a `Vst3Preset`, a
sibling wrapper of `AbletonDevicePreset` with no `Device` child, and it carries
a `Uid` of four big-endian ints and NO plugin name.

Resolving that to a name is a byte search, not a lookup:
`showDirectoryPicker()` on the user's VST3 folder once, then stream each
`.vst3` looking for the 16 bytes in both COM and plain order - Windows embeds
the COM form, and the SDK is not COM-ordered everywhere. The filename is the
answer, and the result is a `uid -> name` table worth caching in IndexedDB so
the scan happens once rather than per rack.

`moduleinfo.json` is the documented route and is not usable as the primary
one: it is opt-in for vendors and there are zero of them on the maintainer's
machine, where every `.vst3` is a bare DLL.

A MISS is a useful answer. A class id no local plugin contains is a rack this
machine cannot fully load, which is the question the view exists to answer.

### 4.2 Colour index mapping - CLOSED

Answered: grid position is the stored index (SCHEMA.md Q13), confirmed at both
ends of the grid against `donors/BS.adg`. `livePalette.ts` can be indexed
directly and `macroColor()` already did. `-1` means no colour set, not an
index.

### 4.3 The contract: device options above the rack

The new direction. A rack comes in; the user ticks the pieces of their
convention; the rack comes out conforming.

#### 4.3.1 The interaction

A horizontal strip of options above the rendered rack. Each option is one
device the contract can guarantee, with its own settings. Ticking one
materializes it: the device is added if absent, a macro is bound to the
relevant parameter, named from a pattern, coloured, and placed in the slot the
contract assigns it.

Global settings sit alongside: the rack name (for example `BS`), written to
the rack's name and used for the output filename.

**One code, everywhere.** That name reaches the rack, every macro the contract
adds, and every device it inserts, so a rack is identifiable from any one of
them. A device already in the chain keeps whatever its owner called it -
renaming someone else's device is not this tool's job. Keep the code short:
`BS GAIN` fits on a knob, a 21-character label wraps and grows the whole rack
(SCHEMA.md Q19).

**A piece already present is detected, not duplicated.** If the rack already
ends in a Utility, the option shows as satisfied, coloured differently, and the
user can still edit its name, colour and slot. The tool reuses what is there.

**The contract's macros take the FIRST slots, and the rack's own macros shift
right.** That is what makes them familiar: whatever rack you open, the leading
knobs are the ones you put there. Their order among themselves is the order of
the options in the strip, so it is the same on every rack. The editor's
existing drag-to-reorder stays available for exceptions.

Shifting needs a new codec mutation - insert K empty slots at the front,
displacing what is there - and it must permute variation values like every
other slot-changing mutation (Constraint 4). `donors/PD.adg` carries a
variation, so this is testable against a real rack from day one.

**The shift can fail, and the donor proves it.** `PD.adg` already uses all 16
slots. There is no room to insert anything, and `setMacroCount` cannot go past
16 (Constraint 6). Running out is the one case that forces a parent rack, which
4.3.3 treats as a last resort rather than a choice.

#### 4.3.2 The options, as specified

| Option | Device | Macros | Settings | Donor |
|---|---|---|---|---|
| Utility Gain | `StereoGain` | `{name} GAIN` | colour, bass mono | `PD.adg` |
| Gate | `Gate` | `{name} GATE ON/OFF` | colour, sidechain switch | `PD.adg` |
| Compressor | `Compressor2` | - | colour, sidechain switch | `PD.adg` |
| AutoFilter | `AutoFilter2` | `{name} AUTOFILTER` | colour | `PD.adg` |
| EQ Three | `FilterEQ3` | `{name} LO`, `{name} MID`, `{name} HI` | colour per band | `BS-EQ3.adg` |

What `donors/PD.adg` establishes:

- `StereoGain` carries `Gain`, `Mono`, `BassMono`, `BassMonoAudition` and
  `BassMonoFrequency`, so the bass mono checkbox is two real parameters.
- **Live 12 writes `AutoFilter2`, not `AutoFilter`.** patchbay's donor set has
  the older tag. Insert what Live writes today.
- The rack's own macro 9 is `GATE ON/OFF` bound to the Gate's `On`, and macro
  16 is `PD GAIN` bound to both the Utility's `Gain` and Drift's
  `Global_StereoVoiceDepth`. The convention this feature automates already
  exists by hand, and one contract macro driving two parameters is normal.

**EQ Three is `FilterEQ3`**, with band gains `GainLo`, `GainMid` and `GainHi`
in linear amplitude rather than decibels (SCHEMA.md Q21). Its three options
share ONE device per chain: the second and third find the EQ the first
inserted and reuse it.

All five options now have a donor.

#### 4.3.3 Where the devices go: in parallel, across every chain

**One device per chain, one macro driving all of them. No parent rack.**

This is the behaviour that justifies the tool, and `donors/BS.adg` is the
worked example. It has two parallel terminal chains, and:

- `BS GAIN` (macro 5) drives `Gain` on a `StereoGain` at the end of **each**
  chain.
- `GATE ON/OFF` (macro 9) drives `On` on a `Gate` in **each** chain.
- `ARP TOGGLE`, `ARP STEPS` and `ARP STYLE` each drive the same parameter of a
  `MidiArpeggiator` in **each** chain.

So the rule is: insert the option's device at the end of every chain, then bind
one macro to every instance. A macro driving several parameters at once is
already normal in this codec - `Macro.bindings` is an array and every mutation
operates on all of them - so the mechanism exists.

**The contract inserts symmetrically: same device, same parameter, every
chain.** A hand-built rack can be asymmetric - `BS.adg`'s `LPF` drives
`Filter_Frequency` on a `Drift` in one chain and `Freq` on an `Eq8` band in the
other - and the codec must keep reading and preserving that. The contract just
does not author it. Wanting the same treatment on both chains is served by
inserting the same device twice, which is symmetric and simpler to reason
about.

**Why not a parent rack.** Wrapping is the cheap answer and anyone can do it by
hand in Live in a few seconds, so a tool that does it adds nothing. It also
costs real ergonomics: an extra layer forces a menu dive on Push to reach the
knobs that are not mapped on the outer rack. Applying the same macro across
parallel chains is the part that is tedious by hand and is exactly what this
tool should do.

**Wrapping stays as a last resort, not an option to pick.** The only case that
forces it is running out of macro slots: the contract's macros go at the front
(4.3.1) and a rack cannot exceed 16 (Constraint 6). `donors/PD.adg` is that
case, with all 16 slots in use. When it happens the tool should say so and
offer the wrap rather than performing it silently, and the parent must match
what it wraps - `InstrumentGroupDevice` around an instrument rack,
`AudioEffectGroupDevice` around an effect rack.

**Partial satisfaction.** A `StereoGain` at the end of chain 1 but not chain 2
is neither present nor absent. Reuse the one that is there, insert into the
chain that lacks it, and bind the macro to both. Worth its own state in the UI
so the user can see what the tool is about to add.

#### 4.3.4 Insertion hygiene, which is mandatory

Pasting a donor into a rack is not enough. `clone.py` in patchbay is an
enumerated list of what breaks, each entry there because a file was rejected or
silently corrupted:

- an inserted device's `Id` set from its position in the chain, since that is
  what an `Id` is (SCHEMA.md Q16), with its interior left at 0
- session ids zeroed
- empty `Int64` fields filled
- legacy path elements stripped
- unsourced samples stripped
- a loadable check run before the file is handed to the user

This is work, not discovery. But it is not optional: the failure mode of this
feature is a rack that loads and behaves wrong, which is the worst outcome this
project has.

#### 4.3.5 Donors, and where they come from

Constraint 7 says a device must be copied from a real instance. Donors live in
`packages/adg-codec/donors/`, which is negated in `.gitignore` because `.adg`
is otherwise excluded repo-wide.

`PD.adg` is the first one and covers four of the five options: `StereoGain`,
`Gate`, `Compressor2`, `AutoFilter2`. It also carries `Eq8`, `Delay`, `Reverb`
and `Drift`, which are not options yet.

Adding support for a new device means putting it in a rack in Live, saving,
dropping the file there, and recording what it yields in that directory's
README. No user-facing donor concept, no harvest UI.

patchbay's `donors/README.md` records a trap worth knowing even though our
layout differs: when two files can supply the same device, the tie-break must
be deterministic. Theirs is filename-based and it bit them twice, because
filename order is case-insensitive on Windows and case-sensitive elsewhere, so
the same repo built different racks on different machines. With one harvest
source per device there is no tie; if that stops being true, make the rule
explicit before it matters.

#### 4.3.6 The external sidechain source is not carried by a preset

Asked: would free text be enough, matching the source track by name?

**No, and this is now settled** - SCHEMA.md Q14. `donors/PD.adg` was saved with
its Gate AND its Compressor both routed to a separate track, and the file keeps
`SideChain/OnOff/Manual = true` while holding `Target = AudioIn/None` and
`UpperDisplayString = No Output`. The entire document contains no routing value
other than `AudioIn/None` and `AudioOut/None`. The switch survives the save;
the source does not.

**What the option can do:** insert the Gate or Compressor, switch its sidechain
on, bind and name the macro. **What it cannot do:** set the source. That stays
one manual step per Set, and the UI has to say so rather than implying the
routing came across.

#### 4.3.7 Remembering the convention

The choices - colours, name patterns, which options are on, slot assignments -
persist in `localStorage` so a second rack comes out like the first.

Two caveats it has to answer:

- `localStorage` is per browser and per origin, so conventions do not travel
  between machines, and **the bundled device is a different origin from the
  website**, so they do not travel there either.
- One export/import button, writing the convention as a JSON file, fixes both
  for about an hour of work. Build it with the storage, not after.

#### 4.3.8 Status: the codec half is done and confirmed in Live

`applyContract` is built and tested, and its output has been loaded in Live on
a real rack. Utility Gain and AutoFilter both land: a new device at the end of
every chain, one macro driving all of them, the rack's own macros shifted
right, and an existing device recognised and reused rather than duplicated.

Two things that only opening it in Live could have caught, both now fixed and
recorded as SCHEMA.md Q19:

- `NumVisibleMacroControls` must be EVEN. An odd count loads and draws the
  macro grid wrong, making the rack taller than a rack may be.
- A macro label of 21 characters wraps onto a second line and takes the whole
  rack's height with it. Hand-built racks here top out at 12.

Still to do here: Gate and Compressor (both have donors; the sidechain source
stays manual per 4.3.6), then EQ Three once a donor for it exists.

### 4.4 Editor open items

- **Cables that persist on selection.** Clicking a macro or a parameter should
  show its existing patch cables, fading in and out rather than blinking. The
  machinery is in `PatchCable.tsx` and `useParamDrag.ts`; it currently draws
  only during a drag. Requested, not built.
- **Mapping table units.** Min and Max show as raw numbers. Live shows the
  target parameter's own units (`20.0 Hz`, `-inf dB`), which are not
  recoverable from the file for every parameter type. patchbay's donor index
  knows the native range per parameter, so importing it would supply this.
- **Sorting the mapping table** by column header, as Live's own list does.

### 4.5 Offline - DONE

`vite-plugin-pwa` in `apps/site/vite.config.ts`, `registerType: 'autoUpdate'`,
with `scope`, `start_url` and the manifest all taking `VITE_BASE` so one config
still serves dev, Pages and the device bundle.

Two things worth keeping:

- **The default `globPatterns` omits `jpg`**, which is what the logo is, so the
  first build precached 302 KiB and an offline load came back without it. It
  precaches 9 entries and 2.7 MB now.
- **`VITE_EMBED=1` skips the plugin entirely.** Bundling already solves offline
  in the device, and a service worker there only adds a layer that can serve a
  stale UI after a device update. `release-device.yml` carries a note to guard
  on `sw.js` when embedding lands.

### 4.6 Save in place

`showOpenFilePicker()` returns a handle writable through `createWritable()`, so
the site can save the modified `.adg` over the original instead of downloading
a copy the user then has to find.

```typescript
const [handle] = await window.showOpenFilePicker({
  types: [{ description: 'Ableton Device Group', accept: { 'application/gzip': ['.adg'] } }],
});
const rack = Rack.parse(new Uint8Array(await (await handle.getFile()).arrayBuffer()));

// ...edit...

const writable = await handle.createWritable();
await writable.write(rack.serialize());
await writable.close();
```

- Reuse trackster's `src/types/file-system-access.d.ts`.
- Firefox and Safari support is weaker than Chromium's, so keep the `<input
  type="file">` plus download path as an automatic fallback, and detect rather
  than assume.
- Writing over the user's original file raises the stakes on Constraint 4.
  Default to read-only, and require an explicit opt-in before any destructive
  write.

### 4.7 The Max for Live device, as a bundle

**It adds no editing capability. It is the same app, reachable without a
browser and without a network.** Anyone who has the site has everything the
device does.

The pattern is proven by `m4l-gugelhupf`, the author's own: an `.amxd` with a
`-site` folder beside it holding the local copy of the web app, opened in a
window.

**The device view is minimal**, because it is 169px tall and does not scroll:

- an **Open** button, which opens the editor in a pop-up window
- optionally, **a list of the rack devices on this track**, so the user can see
  which racks are candidates

Everything else happens in the window.

**What "import racks from this track" can and cannot be.** LOM can enumerate
the devices on the track the device sits on, so it can list rack names. It
cannot read their mappings (Constraint 1) and it cannot find their files
(Constraint 2). So the honest feature is: list the racks by name, and for each
one either offer a matching `.adg` from the User Library or tell the user to
save it first. It is a shortcut to the file picker, not a way to read a live
rack. Do not let it imply otherwise in the UI.

Bundling checklist, most of which the site already satisfies because it was
designed backend-free:

- Relative asset paths. `release-device.yml` passes `VITE_BASE: './'` and
  asserts no absolute asset paths survived, because an absolute
  `/ableton-rackutils/` path resolves against the filesystem root inside `jweb`
  and 404s into a blank window.
- No absolute-root fetches, no CDN imports at runtime. Everything vendored.
- **The device UI drops the landing chrome, at build time.** No logo, no guide,
  no images: load a rack, tick the contract options, see the rack and its
  connections. The device window is small and its user installed the thing on
  purpose, so nothing there has to explain what the tool is. `Landing.tsx`
  holds all of it and `vite.config.ts` aliases that module to
  `Landing.embedded.tsx` under `VITE_EMBED=1`, which keeps the assets out of
  the module graph rather than merely unrendered - hiding the markup still
  bundled the 2.4MB logo. Embedded build: 282 KB of JS and 16 KB of CSS, no
  images, no service worker.
- No service worker (4.5).
- The device reports the bundled site version, so a bug report from inside Live
  is traceable to a commit.

Two open questions in `release-device.yml`, both marked in the file: whether the
`m4l-jweb` device build needs macOS and a Max toolchain (currently assumed, and
macOS runners bill roughly 10x Linux), and the exact output paths for the
`.amxd` and the embedded web directory.

---

## Build order and risk

| Order | Work | Risk if skipped |
|---|---|---|
| 1 | 4.3.1 the options strip UI | The contract has no surface to drive it |
| 2 | 4.1 VST dependency view | None, but the route is settled and cheap |
| 3 | 4.3 remaining devices | Contract covers two options only |
| 4 | 4.4 editor open items | Feature gaps only |
| 5 | 4.6 save in place | Current download flow works |
| 6 | 4.7 device bundle | Site already delivers everything |

### Open risks

1. **A plugin binding is invisible in the editor** (SCHEMA.md Q20). Macro
   moves carry it correctly now, tested against `BS-VST3-mapped.adg`, but
   `Macro.bindings` is built from `KeyMidi` so the mapping table shows nothing
   for a macro driving a plugin parameter. Showing it means widening the
   `Binding` model, since a plugin binding has no `targetPath`.
2. **"Loads in Live" is not "looks like a rack."** Both Q19 faults produced a
   valid file with working mappings that 122 passing tests could not see. Every
   new device the contract learns to insert gets opened in Live before it
   ships, not just tested.
3. **Bindings the codec cannot see** (4.0, fixed). Found once, on the rack's own
   parameters. The rack device may carry other bindable parameters beyond
   `ChainSelector`, so it is worth re-checking against a rack that maps several
   of them, not only `BS.adg`.
4. **Insertion produces a rack that loads and behaves wrong** (4.3.4). The
   worst failure mode available. Mitigated only by the hygiene checklist and by
   loading every new device type in Live by hand.
5. **Range inversion semantics (SCHEMA.md Q4).** The editor writes inverted
   ranges and the only direct evidence that Live honours `Min > Max` is
   patchbay's Live 12.4.3 note. Confirm with our own diff.
6. **The macro shift can have nowhere to go** (4.3.1). A rack using all 16
   slots cannot take the contract's macros without being wrapped. `PD.adg` is
   exactly that case, so it will be hit immediately.
7. **Live closes the gap.** The whole value proposition of Job 1 is that Live
   cannot move a macro mapping. Its Macro Mappings panel is recent and sits
   directly adjacent. Worth rechecking on each Live release.
8. **Asset paths in the bundled build (4.7).** The most likely device-side
   failure is a blank window from absolute paths resolving against the
   filesystem root.

### Do not

- Do not model anything in `adg-codec` that is not traceable to a diff recorded
  in `SCHEMA.md`. Guessing an element name or a colour index produces files
  that load in Live without complaint and silently corrupt.
- Do not generate device XML. Copy a donor. Constraint 7.
- Do not hand the user a file that has not passed the loadable check.
- Do not compare `.adg` files byte for byte in tests. Gzip headers embed a
  timestamp. Compare normalized XML.
- Do not attach live listeners to a whole nested rack at once.
- Do not auto-load a guessed file path.
- Do not let the site import from the device package, or let any editor
  component branch on whether the device is present.
- Do not add a backend. The moment file bytes leave the browser, the privacy
  claim on the landing page stops being true.
- Do not point the device at the deployed URL. Bundle the build, as
  m4l-gugelhupf does.
- Do not ship the service worker in the device build.
- Do not use HTML5 drag-and-drop for editor gestures. See DONE, D3.
- Do not let the contract grow into session scaffolding. See Parked.

---

## Parked

Considered, and not being built. Each entry says what killed it, so the same
ground is not covered twice.

**Session and project scaffolding.** Generating tracks, routing, returns, or an
`.als` from a template. It is a coherent product and it is a different one:
the moment the tool reasons about tracks it stops being a rack tool. The
boundary that keeps this honest: anything inside one `.adg` is in scope,
anything naming a track is not. The external sidechain source (4.3.6) sits
exactly on that line, which is why it needs a diff before it gets an option.

**A DSL front end.** patchbay already is one, and the point of this tool is to
deliver the same consistency without asking anyone to write a spec. Deriving a
contract from a rack the user already likes covers the same ground with no
language to learn.

**Batch operations across a rack library.** Scanning a folder, conforming forty
racks at once, library-wide audits. Real for someone with a large library; the
target user has eight racks, one per track, sized to a Push layout with no
scrolling. A per-rack button is the whole feature at that scale.

**Live values on the macro knobs, and click-to-pick a parameter in Live.**
Both need LOM and both were interesting while the device was a product. With
the device reduced to a bundle, neither earns the machinery. Click-to-pick also
had an unsolved half: matching a LOM parameter back to its element path in the
file.

**Scripted hotswap reload.** Live's Browser API has `is_loadable`,
`relation_to_hotswap_target` and `load_item`, and `browser.hotswap_target`
appears read-only, so a script probably cannot point hotswap at a device the
user has not already put into hotswap. Dragging the file back always works and
needs nothing undocumented.

**The loopback WebSocket bridge.** Existed to let a browser tab talk to the
device for live values. Bundling removed the reason, and live values are parked
anyway.

**A Python control surface.** Only ever needed for live values outside the
current track. Parked with them.

**Macro Variation authoring.** Variations must stay correct under a move -
Constraint 4, already tested - but creating, recalling and deleting them is a
different tool.

**Drum pad scroll window, knob redraw, chain selector strip, zone editors,
Rand/Map.** Fidelity to Live's UI for its own sake. `PadScrollPosition`
geometry is unconfirmed (SCHEMA.md Q10) and would need a diff nobody needs yet.

**Automatic and sticky macro colours by name.** Superseded by 4.3: the contract
assigns colours explicitly, which is the same benefit without inference.

---

## Prior art, all by the same author

- `alienmind/patchbay` - Python DSL for authoring racks. Its `doc/SCHEMA.md` is
  the head start behind most of ours, its `donors/` is where 4.3's device
  instances come from, and its `clone.py` is 4.3.4's checklist.
- `alienmind/m4l-jweb` - the framework the device is built on.
- `alienmind/m4l-gugelhupf` - an `.amxd` with a `-site` folder beside it holding
  the web app, opened in a window. The bundling pattern 4.7 copies.
- `alienmind/trackster` - the CI/CD, PWA, and File System Access patterns
  copied here.

---

## DONE

Outcomes, not instructions. Read the source for shapes; what is kept here is
the reasoning that is not recoverable from it.

### D1. Schema investigation - DONE

`packages/adg-codec/SCHEMA.md` answers Q1 to Q13, each with the diff that
proves it, against four structurally different real racks. Q1, Q2, Q4, Q5, Q7
and Q8 are independently confirmed against our own fixtures. Q9 (LOM, not file)
and Q10 (`PadScrollPosition`) remain open, Q4's inversion half is second-hand,
and Q13's colour index order is 4.1.

The method that produced them is still the method for any new question: save a
rack, change exactly one thing in Live, save again, `pnpm adg-tool diff`. The
tool filters the `Id`, `PointeeId`, `LomId` and `LomIdView` attributes Ableton
regenerates on every save, which otherwise bury the real change. Filtering
makes diffs readable; it does not mean those ids can be ignored when writing
(D2).

### D2. `adg-codec` - DONE

`Rack.parse`/`.clone`/`.serialize`/`.subRack`, `macros`/`variations`/`chains`,
and thirteen mutations: `moveMapping`, `reorderMacro`, `swapMacros`,
`bindParameter`, `unbindMacro`, `unbindOne`, `renameMacro`, `renameRack`,
`setMacroCount`, `setMacroColor`, `setChainColor`, `setBindingRange`,
`invertBindingRange`. 88 tests, 18 of them against four real racks (gitignored,
skipped cleanly when absent).

Decisions that still bind:

- **The DOM is the source of truth.** Mutations edit the parsed DOM; the typed
  model is a read-through view recomputed on access. The alternative - parse to
  a pure data model and rebuild XML at serialize time - guarantees losing
  anything the parser did not model, and a rack contains a great deal (device
  state, sample references, warp markers, unknown future elements) this tool
  has no reason to understand.
- **Therefore mutations are not pure functions.** They mutate in place and
  return `{ ok, warnings }`. Copying is explicit: `clone()` deep-clones the
  DOM, and undo is a stack of clones, which is honest about the cost rather
  than hiding it behind fake immutability.
- **Mappings are containment-addressed, not id-addressed** (Q1/Q2). A mapping
  is a `KeyMidi` element inserted as a child of the target parameter, with the
  macro index on its `NoteOrController`. There is no id, no pointer, no path
  string in the mapping itself, so `moveMapping` edits one attribute in place
  rather than relocating a node or reconciling an id.
- **A macro has many bindings, not one.** One knob driving several parameters
  is normal Live usage. `Macro.bindings` is an array and every mutation
  operates on all of them. An early singular `Macro.binding` moved only the
  first target found and silently left the others pointing at the vacated slot.
- **Never invent ids, never reuse one across different objects.** If a mutation
  genuinely needs a new element, allocate above the current maximum. Getting
  this wrong produces a file that opens without complaint and behaves
  incorrectly, the worst available failure mode. Prefer moving existing nodes
  over constructing new ones wherever the schema allows.
- **pako, not `CompressionStream`.** Synchronous, identical in Node and
  browser, and avoids an unknown about which Chromium build `jweb` embeds.
- **`serializeXmlDoc` handles the XML declaration explicitly** (Q12).
  `XMLSerializer` omits it in jsdom and emits it in Chrome; Ableton writes it
  in every file and rejects a file without it outright. An unconditional
  prepend then produced two declarations in Chrome and `Rack.clone()` threw on
  reparse. Both directions of this were shipped before being caught.

`DeviceNode` and `ParamRef` carry a `path`, an index chain relative to the
rack's `BranchPresets`, resolved by `pathOf`/`resolvePath` in `dom.ts`.

### D3. The editor UI - DONE

`packages/editor-ui` renders a rack the way Live draws it. 24 tests across
`render.test.tsx` (what comes out of a render) and `interact.test.tsx` (real
DOM events fired at a mounted tree). Both are needed: the first cut shipped
with every interaction broken and every render test green.

**Reproduce Live's layout, do not invent one.** The governing rule, set by the
project owner after rejecting a first cut that laid racks out as a vertical
stack of cards. Users already know where things are in a rack; a tool that
rearranges that knowledge costs them more than it gains. Concretely:

- **Everything is ONE flat row.** A rack's controls, its devices, and any
  nested rack's controls and devices are all siblings at the same top edge.
  Nesting is shown by boundary brackets between panels, not by containment. A
  nested rack rendered INSIDE its parent made racks cascade downward, capped
  depth at however many title bars fit vertically, and produced scrollbars
  inside scrollbars. Depth costs width only.
- **A rack is exactly one device row tall: 169px, plus its title bar.** That is
  the height a Max for Live device view gets, and it does not scroll, so
  anything taller is unreachable there. Enforced with `height`, not
  `min-height` - it regressed twice when panels were allowed to size to
  content.
- **A collapsed device or rack becomes a vertical title strip**, not a hidden
  thing.
- **Macros sit in two rows numbered across then down** (`1 2 3 4 / 5 6 7 8`),
  the grid being `ceil(count / 2)` wide, and the +/- buttons step by TWO. That
  is a file rule as well as a UI one: an odd `NumVisibleMacroControls` loads and
  draws the grid wrong (SCHEMA.md Q19).
- **Only the selected chain's devices are drawn.** Live shows one chain at a
  time, and doing the same is what keeps the row a row: rendering every chain's
  devices turned a four-pad drum rack into a page-height wall.
- **Nested racks and devices start collapsed.** Opening everything by default
  pushed the rack you came to look at off the screen. A drum rack with 16 pads,
  each holding a nested engine rack, expands to thousands of parameter rows.
- **The rack's left edge carries Live's button column**: show/hide macros, add
  two, remove two, Macro Variations, collapse devices, show/hide chains.
- **Colour goes on the label**, not the dial. Live's knob arc is the same blue
  whatever colour the macro is.

**Interactions:**

- **Pointer events, never HTML5 drag-and-drop.** DnD did nothing in a real
  browser and swallowed clicks on buttons inside a `draggable` element. It is
  also not something to rely on inside the Max `jweb` webview. Listeners attach
  in the pointerdown handler, not from an effect: `useMacroDrag` attached them
  from an effect and silently dropped any gesture that finished before React
  committed. Slow enough to pass by hand, fast enough to fail under Playwright.
- **Drag a knob onto another to move the whole macro; Shift to swap.**
- **Drag a parameter onto a knob to bind it**, drawn as a hanging patch cable
  that takes the target macro's colour, wobbles on connect and retracts on a
  miss. Click-to-arm still works and is the keyboard-reachable path.
- **A macro can only drive a parameter in its OWN rack** (Q2's owning-rack
  walk), so a drop onto another rack's knob is refused rather than writing a
  mapping the file cannot express.
- **Undo/redo is global**, on the root rack's title bar: one history across
  every rack level, because a mutation on a nested rack edits the same
  document.
- **A mapping table laid out like Live's own Macro Mappings list**: Macro,
  Path, Name, Min, Max, one row per binding, each with an unbind control. Min
  and Max are editable and an invert control swaps them for that row alone,
  since inversion is stored as `Min > Max` rather than as a flag (Q4). A range
  reaches the codec on Enter or blur, never per keystroke: every mutation
  clones the rack and pushes an undo entry, so typing "35" would cost two of
  each and write a partial value on the way through. Live 12.4.3 has no range
  editor in its macro right-click menu, so this table is the only place a range
  can be authored at all.

**Derive, never mirror.** Mapped vs unmapped, macro colours, chain lists are
all computed from the `Rack` on every render. Nothing is copied into React
state and kept in sync by hand. That is what makes a parameter jump out of
"more" the instant it is bound, and it is why applying a mutation clones the
rack: a new reference so React re-renders, with the DOM as the single source of
truth.

Rack identity travels as a **path** (the chain of device paths from the root),
never as a `Rack` handle - every mutation replaces the handle, so a stored one
is stale immediately.

**Colours** come from Live's real 70-colour palette, sampled pixel-by-pixel
from a screenshot of its picker by `pnpm adg-palette` into `livePalette.ts`.
Grid order is not yet confirmed to be stored index order (4.1).

Keys use `node.id`, never name or type. Two Saturators in one chain, or two
drum pads with default names, would collide otherwise.

### D4. The site - DONE

`apps/site` is deployed to GitHub Pages: drop an `.adg` on the page, edit it,
save a copy. Plus a getting-started guide walking through saving a rack out of
Live and dragging it back in. 22 Playwright specs run against real Chromium in
CI.

- **`base` comes from `VITE_BASE`**, not hardcoded and not sniffed from
  `GITHUB_ACTIONS`, so one config serves local dev (`/`), Pages (`/<repo>/`)
  and the future device bundle (`./`).
- **Saving downloads a copy**; the original file on disk is never touched. 4.4
  would change this behind an explicit opt-in.
- **The landing copy answers three questions above the fold**: what it does,
  where the file goes (nowhere, no server exists to upload to, repo linked so
  the claim is checkable), and what it costs (nothing, no account).
- **The getting-started steps are three columns.** A fourth step left an orphan
  row on its own, so finding the file and dragging it in are one step.
- **The companion device is marked "Soon!"** with no download offered, because
  it is a scaffold. When it does something, the entry states what it adds
  (targeting and live values) and what it requires (Live 12, Max for Live). An
  `.amxd` is executable content and installing one is a real trust decision, so
  the source and the build workflow get linked at that point.

### D5. Shipping the device from the site - DONE

`release-device.yml` runs on every push to `main` rather than on a manual
`device-vX` tag, since there is no versioning scheme yet, and always overwrites
the same rolling release at a fixed tag, `latest-device`, marked `prerelease:
true`. The site therefore cannot use `/releases/latest` - GitHub's own docs say
that endpoint excludes prereleases and drafts - and fetches
`/releases/tags/latest-device` instead. The `.amxd` is a release asset, not a
file in the repo, so the site is not rebuilt to ship a device update.

`apps/site/src/companion/download.ts` returns null on any failure and the UI
always has a hardcoded fallback. GitHub's unauthenticated API is rate-limited
per IP and will occasionally fail for reasons having nothing to do with the
user. The download itself stays hidden until the device does something (D4),
which under 4.7 means until it opens the bundled editor.

Once the codec's versioning matures enough for real `device-vX` releases to
make sense, revisit: either the site should prefer a real tagged release over
the rolling one, or the rolling-build concept should retire entirely.

This matches how m4l-gugelhupf distributes: a zip of devices on GitHub
Releases, with a maxforlive.com listing pointing at it. Worth listing there too
once the device is more than a scaffold. Note that maxforlive lists a single
device file, so a multi-device release ships a zip rather than fighting the
form.

### D6. CI/CD - DONE

- `ci.yml` - lint, typecheck, codec and UI tests on every PR, plus a separate
  `browser` job running the Playwright specs in Chromium. That job exists
  because jsdom is not a browser (SCHEMA.md Q12).
- `deploy.yml` - Pages, with `VITE_BASE: /${{ github.event.repository.name }}/`
  so it is repo-name agnostic. Codec tests gate the deploy: a broken codec
  corrupts racks silently, which is worse than the site being down.
- `release-device.yml` - see D5. Includes a grep guard that fails the build if
  absolute asset paths leak into the bundle, since that is the top device-side
  failure mode.
