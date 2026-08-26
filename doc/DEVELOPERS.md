# Developing ableton-rackutils

Everything needed to work ON the toolkit, as opposed to using it. For usage,
see the [README](../README.md).

## Docs

Everything needed to continue is in the repo.

| File | What it is |
|---|---|
| [`doc/PLAN.md`](PLAN.md) | What is LEFT: status, the backlog in order, known faults, and a list of what is already built. Nothing about how to build it - that is this file. |
| [`packages/adg-codec/SCHEMA.md`](../packages/adg-codec/SCHEMA.md) | Schema findings, confirmed against real racks. The codec's spec. |
| [`CLAUDE.md`](../CLAUDE.md) | House rules: commit style, comment style, where scratch work goes. |

## Repo layout

```
packages/adg-codec/   parse, mutate, serialize .adg. No UI deps.
packages/editor-ui/   shared React components. No Ableton deps.
apps/m4l-device/      the same site, bundled into an .amxd. Adds no features.
apps/site/            the product. Static, deployed to GitHub Pages.
tools/adg-tool/       CLI: unpack/diff a rack, or exercise the codec directly.
```

Rules that keep the pieces honest:

- `adg-codec` must not import React, and must run identically in Node and the
  browser.
- `editor-ui` must not import anything `m4l-jweb`-specific. It takes live data
  as plain props. The device adds no capability, so nothing may branch on
  whether it is present.
- `apps/site` must never import from `apps/m4l-device`. The site has to build
  and deploy with the device removed entirely.
- Browser-only APIs live where they belong: the plugin folder scan and the
  `uid -> name` cache are in `editor-ui` beside the strip that uses them, and
  the file handle the site saves through is in `apps/site`. Both are feature
  detected, never assumed - `showDirectoryPicker` and `showOpenFilePicker` are
  Chromium's today, and the fallbacks are the file input and the download.
- The build stays a pure static build. No SSR, no API routes, nothing that
  assumes a Node process at runtime.

## Why this tool edits files

The precise version of the README's short answer, because the imprecise
version is easy to write and wrong.

Live itself knows perfectly well what a macro drives - right-click a macro
knob and its context menu offers "Remove Mapping to \<rack\> | \<chain\> |
\<parameter\>", naming the target exactly. What does not exist is programmatic
access to it. The Live Object Model exposes a macro as a `DeviceParameter`
with an observable value, and nothing that says which parameter it drives.
Not through Max's `LiveAPI`, not through a Python Remote Script, not through
AbletonOSC (whose own docs list `RackDevice` and `Chain` as incompletely
exposed). There is no call to create, move, or delete a mapping either.

A second limit compounds it: a Max for Live device can act on the device
chain it sits in far more readily than on some other rack elsewhere in the
set, and the rack a user wants to edit is generally not the one hosting the
editor.

So mapping edits are a file operation. This is `PLAN.md` Constraint 1, and it
shapes the whole design - see also Constraint 2 (a loaded device carries no
pointer back to the file it came from, so the user must pick the file).

## What the tool is

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

---

## Current state

v0.4.2, beta. The codec is built and tested, the site renders the editor
through `packages/editor-ui` with the rack features strip and the plugin strip
on top of it, and the device carries the same editor offline. Racks it edited -
and racks the contract authored - have been loaded back into Live and played,
the device has been installed and opened, the plugin scan has resolved a real
plugin from a real VST3 folder, and the site has been used on a phone.

Before changing anything, read the two lists in [`PLAN.md`](PLAN.md): what has
been confirmed BY HAND, and what is left. One known fault is open - a drum
rack's chain selector stops selecting when it is applied alongside the full set
of features, bisected but not fixed.

## Setup

Node 20+ and pnpm 10.

```bash
pnpm install
pnpm dev            # site at http://localhost:5173
pnpm build          # static bundle into apps/site/dist
pnpm lint
pnpm typecheck
pnpm test
```

Run all four of `lint`, `typecheck`, `test`, `build` clean before committing.

## Testing the codec

```bash
pnpm test                                  # everything headless, 252 tests
pnpm --filter @rackutils/adg-codec test    # 189 codec tests
pnpm --filter @rackutils/editor-ui test    # 63 UI tests
pnpm test:e2e                              # 52 browser specs, needs Chromium
```

The first time, install the browser: `pnpm --filter @rackutils/site exec
playwright install chromium`.

`editor-ui` has two kinds of test and both are needed. `render.test.tsx`
checks what comes out of a render; `interact.test.tsx` mounts the tree and
fires real DOM events at it. The first cut of the UI shipped with every
interaction broken and every render test green - markup was never the
question.

### Neither of them runs in a browser, so there is a third suite

Both run under jsdom, which is not Chrome. Two bugs got through with a fully
green suite:

- **The XML declaration** (`SCHEMA.md` Q12). jsdom's `XMLSerializer` omits it,
  Chrome's includes it. The codec added one unconditionally, so in the real app
  every document had two, `Rack.clone()` threw on reparse, and every single
  edit failed silently. 89 tests passed throughout.
- **HTML5 drag-and-drop.** Worked in jsdom, did nothing in Chrome.

A test suite cannot falsify an assumption about the environment it is itself
running in. So:

```bash
pnpm test:e2e            # Playwright, real Chromium, against the dev server
```

The specs in `apps/site/e2e/` run in CI as a separate `browser` job. They
drive the real gestures - a pointer drag between two knobs, a click on the
unbind "x", a colour pick - and one of them saves a file and checks the bytes,
which is the direct guard on Q12. They use the codec's synthetic racks written
to a temp file, because the real fixtures are gitignored and absent in CI.

Adding one caught a third bug immediately: `useMacroDrag` attached its window
listeners from an effect, so a gesture that finished before React committed
was silently dropped. Slow enough to pass by hand, fast enough to fail under
Playwright - and it would have failed for anyone who flicks a knob quickly.

Add a spec here whenever a change touches DOM serialization, pointer handling,
or layout that must not overflow. Three of them open a TOUCH context
(`hasTouch`, a phone viewport), which is a different page from a narrow window
and is where both mobile faults lived: a file input that filters by MIME type
rather than extension, and a row that scrolls sideways made of elements a drag
starts on.

Of the codec's 189, most are synthetic and always run, 88 run against the
donor racks committed in `packages/adg-codec/donors/` - real Ableton-saved
files that ship with the repo, so they run in CI too - and a handful run
against `packages/adg-codec/tests/fixtures/*.adg`, which are gitignored and
skip cleanly when absent. Several of `editor-ui`'s tests use those same
fixtures, and its heaviest mount `donors/KD.adg` itself.

Both suites run on worker threads, one file at a time
(`vitest.config.ts`). They are minutes of solid jsdom work, and over a forked
process's IPC vitest's own worker-to-main RPC hit its 60 second deadline and
threw - a red CI build in which every test had passed.

**Test every mutation against the real fixtures, not only synthetic ones.**
Three real bugs so far were invisible to the synthetic suite: a macro driving
several parameters at once had only one target moved; the output file would
not load in Live at all because `XMLSerializer` omits the XML prolog; and
parameter enumeration found NOTHING on any native Ableton device, because the
synthetic fixture only ever modelled the Max-device parameter shape
(`SCHEMA.md` Q11). All three were found by using the tool on an actual rack.

The third one is the cautionary tale: the synthetic fixture had been written
from the codec's own assumptions, so it agreed with the bug.

The strongest test available is not automated: run a mutation, then drag the
result into Live and look. It is the only thing that catches a file Live
rejects outright, or one that loads happily and behaves wrong. Do it especially
on a rack with Macro Variations (`SCHEMA.md` Q6), and on every new device type
the contract learns to insert.

The same rule reaches the phone, and got there the hard way twice: a fix
asserted in a touch CONTEXT is not a fix confirmed on a phone, and a page on a
phone may be the service worker's copy of an older one rather than what is
deployed.

## Constraints

The load-bearing facts. Do not design around them without re-verifying them
first; several obvious designs are ruled out by these and by nothing else.

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

The same rule the other way round: a macro's stored values only become
meaningless once it drives NOTHING. `bindParameter` used to clear them whenever
it took a parameter off another macro (Constraint 5), which broke every
variation of a macro that still drove three other chains - exactly what
applying the contract's gain option to a rack does.

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

## Rules


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

---

## Inspecting the .adg format by hand

```bash
pnpm adg-tool unpack ~/path/to/rack.adg > rack.xml
pnpm adg-tool diff before.adg after.adg
```

The tool `SCHEMA.md` was written with. Reach for it whenever a new question
comes up that the recorded findings do not cover: save a rack, change exactly
one thing in Live, save again, diff.

Nothing in `adg-codec` may model macros or mappings that are not traceable to
a diff recorded in `SCHEMA.md`. Guessing element names produces files that
load in Live without complaint and silently corrupt.

## The Max for Live device

```bash
pnpm dev:device       # the device in a browser, with Live mocked beside it
pnpm build:device     # the .amxd, its site folder, and the release zip
pnpm install:device   # copies them into Ableton's User Library
```

No Max install needed. `build:device` runs the SITE's build first, with
`VITE_BASE=./` and `VITE_EMBED=1`, copies it into `apps/m4l-device/site/`, and
`m4l-jweb` delivers that as a `rack-editor-site` folder beside the `.amxd`:

```
apps/m4l-device/dist/@rackutils/m4l-device/rack-editor.amxd
apps/m4l-device/dist/@rackutils/m4l-device/rack-editor-site/editor/
apps/m4l-device/dist/@rackutils/m4l-device.zip     <- the release asset
```

**The folder is not optional.** The device opens an empty window without it,
which is why the zip is what gets published and what the site links.

Two guards run on the built bundle, in the device build and again in CI:

```bash
pnpm --filter @rackutils/m4l-device check:site
```

No absolute asset paths - inside `jweb` an absolute path resolves against the
filesystem root and 404s into a blank window, the top device-side failure - and
no service worker. See `apps/m4l-device/scripts/check-site-bundle.mjs` and
`PLAN.md` D7.

## The contract, and inserting devices

The rules behind `applyContract`, most of them paid for once already.

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

---

## Pipeline

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | PR, push to main | lint, typecheck, codec and UI tests, plus a `browser` job running the Playwright specs in Chromium |
| `deploy.yml` | push to main | codec tests, then build and publish the site to the `gh-pages` branch |
| `beta.yml` | a `*-beta*` tag | the same, for one tag, published under `/preview/<tag>/` |
| `release-device.yml` | push to main, `v*` tag | build the device and its bundled site, guard the bundle, publish the zip - to the rolling `latest-device` prerelease on main, and to the tag's own release on a `v*` tag |

**Pages is served from the `gh-pages` BRANCH, not from an uploaded artifact.**
An artifact replaces the whole site on every deploy, and a beta preview has to
survive main deploying. Both workflows publish to that branch with
`keep_files: true`, so main owns the root and a beta owns its folder. They
share one concurrency group, because two pushes to one branch means one of them
is rejected mid-run.

Codec tests gate the deploy. A broken codec corrupts racks silently, which is
worse than the site being down. The site's device download reads the releases
list live via the GitHub API and offers the newest `vX.Y.Z` carrying a device
zip - see `PLAN.md` D5 and D7.

## Beta previews

A build of any branch, on the real site, for testing on a real phone before the
change reaches main:

```bash
git tag v0.5.0-beta.1
git push origin v0.5.0-beta.1
# -> https://alienmind.github.io/ableton-rackutils/preview/v0.5.0-beta.1/
```

**Unlisted, not private.** This repository is public, so its Pages site is
world-readable. Nothing links to a preview and nobody is told it exists, and
that is the whole of the protection.

Three things a preview does differently:

- **It carries no service worker** (`VITE_NO_SW=1`), and **the deployed site's
  worker is told to keep off preview paths** (`navigateFallbackDenylist` in
  `apps/site/vite.config.ts`). Both halves are needed, and the second is the
  one that bites: that worker's scope is the whole site, so a preview under it
  is in scope, and its navigation fallback answered those URLs with the main
  site's cached page. A preview that had never been deployed looked deployed -
  the old site, wearing the preview's URL, reporting the old version number.
  That is how this was found.

  A device that already has the old worker picks the new one up on its next
  visit to the main site (`registerType: 'autoUpdate'`). Visit the site once
  before opening a preview on a phone that has been there before.
- **Its version badge is the tag**, not `package.json`, so two previews of the
  same version are told apart at a glance.
- **It publishes main to the site root too.** One extra build per beta tag, and
  it means either workflow can create `gh-pages` from nothing: whichever runs
  first leaves a complete site behind.

A preview stays until its folder is deleted from `gh-pages`. They cost nothing
but clutter; delete the folder when the branch is merged.

## Prior art

Earlier projects by the same author, heavily reused here.

- [`patchbay`](https://github.com/alienmind/patchbay) - Python DSL for
  authoring racks. Its `doc/SCHEMA.md` is the head start behind most of
  `SCHEMA.md`.
- [`m4l-jweb`](https://github.com/alienmind/m4l-jweb) - the framework the
  device is built on.
- [`m4l-strudel`](https://github.com/alienmind/m4l-strudel) - proves a full web
  app bundles offline into an `.amxd`.
- [`trackster`](https://github.com/alienmind/trackster) - the CI/CD, PWA, and
  File System Access patterns copied here, plus the SVG knob components
  `doc/PLAN.md` D3 drew on.
