# ableton-rackutils: Implementation Plan (v4)

**Product status: v0.0.1, pre-alpha, does not work yet.**

Canonical plan for `ableton-rackutils`, a Swiss-army toolkit for Ableton rack
preset (`.adg`) files. Lives in the repo so the project is self-contained:
clone it and everything needed to continue is here.

This plan currently describes the first tool built on the toolkit - a macro
mapping editor - end to end, because it's the one concrete enough to plan in
detail and it proves out the codec, the app shell, and the companion device
pattern that later tools reuse. Where the text below says "the product" or
"macrowizard," read it as "the first tool in ableton-rackutils." Nothing here
is meant to lock the toolkit to macro remapping only; `adg-codec` and
`editor-ui` are structured so a second rack-editing tool is an additional
surface, not a rewrite.

Companion docs:
- `doc/DEVELOPERS.md` - setup, repo layout, how to test, the pipeline. The
  practical entry point; this document is the reasoning behind it. (`README.md`
  is for people using the tool, not building it.)
- `packages/adg-codec/SCHEMA.md` - the schema findings log, confirmed against
  real fixtures, that all codec code must trace to.
- `doc/UI-PLAN.md` - the web UI overhaul plan (Ableton-matching macro panel,
  SVG extraction, drag-and-drop, the mapped/"more" parameter split). Its Part 4
  (codec mutations and model additions) is built; the components and the SVG
  work are not - see its own status line.
- `.github/workflows/` - the pipeline described in Phase 4.2.

Handoff document. Written so another agent can pick this up cold. Read the Constraints section before writing any code, several intuitive designs are ruled out by facts about Ableton's API that are not obvious.

---

## Current state and next steps

Scaffolded, two working previews, SCHEMA.md confirmed, and the codec itself
(`model.ts`/`mutate.ts`) is now built and tested. Wiring it into the site's UI
is the next real work.

- `.github/workflows/` - CI, Pages deploy, device release. All three green.
- `packages/adg-codec/src/gzip.ts` - done, works.
- `packages/adg-codec/src/normalize.ts` - done, works.
- `packages/adg-codec/SCHEMA.md` - Q1, Q2, Q4, Q5, Q7, Q8 independently
  confirmed against 3 real fixtures. Q3 holds by structural inference. Q6
  (variations during a mapping move) is exercised by `moveMapping`'s own
  permutation logic and tested against a real rack with variations
  (`withvariations.adg`), but the true confirmation - loading the result back
  in Live and checking by eye - is still on you, see "How to test" below.
- **`packages/adg-codec/src/model.ts` and `mutate.ts` - built.** `Rack.parse`/
  `.clone`/`.serialize`, `macros`/`variations`/`chains` (full device tree,
  including nested racks), and ten mutations: `moveMapping`/`swapMacros`/
  `bindParameter`/`unbindMacro`/`renameMacro`, plus `UI-PLAN.md` Part 4's
  `reorderMacro`/`setMacroCount`/`renameRack`/`setMacroColor`/`unbindOne`.
  `Rack.subRack(devicePath)` exposes any nested rack as a `Rack` of its own
  over the same document, so every mutation reaches nested macros unmodified,
  and drum pads carry their `ReceivingNote` (SCHEMA.md Q10).
  78 tests (`packages/adg-codec/tests/`): 60 synthetic (always run), 18
  against the real fixtures (skip cleanly in CI, run locally). All confirmed
  against `simplerack.adg`, `withvariations.adg`, `drum-nested.adg` and
  `drum-pads.adg` - not just the synthetic fixture.
- `tools/adg-tool/` - `unpack`/`diff` as before, plus three commands that
  exercise the codec directly against a real file without needing the site
  UI: `adg-tool mappings <file.adg>` (list what's bound), `adg-tool move
  <file.adg> <from> <to> <out.adg>` (run `reorderMacro`), and `move-mapping`
  (same arguments, the narrower `moveMapping`). See "How to test" below.
- `apps/site/` - runs (`pnpm dev`), deployed to GitHub Pages, confirmed
  working on a real 4000+ element rack. Still the raw XML tree viewer only -
  not wired to the codec yet, that's next.
- `apps/m4l-device/` - scaffolded with `m4l-jweb init`, builds a real
  `rack-editor.amxd` (`pnpm build:device` / `install:device`), confirmed
  installed and running in real Live: bridge alive, transport ticking. Audio
  effect, passthrough chain, no params, no editor UI wired in - Phase 5 work.
  Now also built and published automatically on every push to `main`
  (`release-device.yml`, Phase 4.5), and the site has a working
  "download companion device" link reading that release live.
- Everything else - not started.

Do this next, in order:

1. **Wire the codec into `apps/site`, per `doc/UI-PLAN.md`.** That document
   now supersedes this section's earlier, much lighter sketch: it specs a UI
   that visually matches Ableton's own macro panel (SVG knobs, editable rack
   name, drag-to-reorder, a mapped/"more" split per device), not just a
   functional drag-to-remap. It also resolves the `editor-ui` question -
   package it for real, `apps/m4l-device` needs to share it. Read
   `UI-PLAN.md`'s own status line before starting: Part 1 (the reference
   screenshot / SVG extraction) is explicitly on hold pending the go-ahead.
2. **Device editor UI** (Phase 5.3-5.4) is lower priority than the above -
   the site is the product, the device is a convenience layered on the same
   codec later.

Default to a read-only or simulated mode in the UI until real-world use has
exercised `mutate.ts` on a range of racks beyond the 3 current fixtures,
following `trackster`'s precedent for a tool that rewrites user files in
place.

### How to test the codec right now

No UI needed yet - two ways, both exercise the real code:

```bash
pnpm --filter @rackutils/adg-codec test   # 78 tests: parsing, all 10 mutations,
                                           # confirmed against real racks too
                                           # if tests/fixtures/*.adg are present

pnpm adg-tool mappings your-rack.adg           # list what's bound to what
pnpm adg-tool move your-rack.adg 1 5 out.adg   # move macro 1 -> macro 5, write out.adg
```

The strongest test available: run `move`, then **drag `out.adg` into Live**
and check the moved macro still drives the right parameter, and - the one
thing this project can't verify by itself - that a rack with Macro Variations
still behaves correctly after the move (SCHEMA.md Q6). If it doesn't, that's
the one remaining from-scratch spike: move a mapping by hand in Live on a
rack with variations, diff before/after, save as `move-after-live.adg`.

Two real bugs were found and fixed exactly this way, against a real rack, not
caught by the synthetic test suite until reproduced there afterward:

1. **A macro driving several parameters at once** (normal Live usage - one
   knob, several things move) only had ONE of its targets moved by
   `moveMapping`, silently leaving the other still pointing at the vacated
   slot. `Macro.binding` (singular) is now `Macro.bindings: Binding[]`, and
   every mutation operates on all of a macro's bindings, not just the first
   found. Regression-tested in the synthetic fixture (a macro bound to two
   parameters at once) since none of the three checked-in real fixtures
   happen to exercise it.
2. **The output file didn't load in Live at all** - drag-and-drop silently
   rejected. Cause: `XMLSerializer.serializeToString()` never emits the
   `<?xml version="1.0" encoding="UTF-8"?>` prolog (true in every browser and
   in jsdom, not a jsdom-specific bug), and every file Ableton itself writes
   starts with it. `serializeXmlDoc` in `dom.ts` now prepends it always,
   confirmed against the same real rack. **This is why "drag the output into
   Live" is the strongest test in this project, not just a nice-to-have** -
   it catches exactly this class of bug, which every synthetic and even
   real-fixture-based automated test missed because nothing in the test
   suite actually asks Live to load the result.

### Backlog (user-requested, not yet scheduled)

Real feature requests from testing against an actual rack, logged here
rather than built blind. Revisit once the site's UI (Phase 3-4) exists to
design them against, since they're mostly UI-shaped, not just codec
primitives:

- **Macro colour.** `MacroColor.N` is modeled (`Macro.color`), `swapMacros`
  exchanges it, and `setMacroColor` authors it directly - all done. Still
  open: the palette table that turns a stored index into a hex colour for the
  UI (`UI-PLAN.md` Part 1.3, on hold), and picking a colour automatically -
  from a
  palette, by name, or "sticky" colours for a given name/function that stay
  consistent across nested racks (e.g. every "Filter" macro anywhere in a
  rack tree gets the same colour). The sticky-by-name case needs a design
  decision (a lookup table shipped with the tool? user-configurable? scoped
  per rack or global?) before it's a codec function.
- **Case transforms for names** (rack/macro/device names - CAPITALIZE,
  lowercase, CamelCase), applied automatically or on demand. Straightforward
  once there's a UI surface to trigger it from; the codec side is just
  `renameMacro`/an equivalent for device names with a transform applied
  first.

### Prior art, all by the same author

- `alienmind/patchbay` - Python DSL for authoring racks. Has the schema work.
- `alienmind/m4l-jweb` - the framework the device is built on.
- `alienmind/m4l-strudel` - proves a full web app bundles offline into an
  `.amxd`.
- `alienmind/trackster` - the CI/CD and offline-first patterns copied here.

---

## Part 1: What the user actually does

### The product in one sentence

Load a saved Ableton rack preset (`.adg`), see its macros and its device tree, drag a mapping from one macro knob to another, save the modified file, reload it in Live.

### The shape of the product

**A website, plus an optional download.**

The website is the product. It is a static site on GitHub Pages. No account, no upload, no backend. The `.adg` is parsed, edited, and rebuilt entirely in the browser tab, and never leaves the machine. That last point is worth saying out loud on the landing page, because "drag your project files into a website" otherwise sounds alarming, and here it happens to be literally true that nothing is transmitted.

The companion device is a convenience, not a requirement. It is a Max for Live device downloaded from the site, which makes targeting and parameter-picking easier by showing what is actually loaded in Live. Everything the tool does is possible without it.

This ordering drives the whole plan: the codec runs client-side because the site has no server, and the device is built against a bridge that is allowed to be absent.

### Tier 0: website only, nothing installed

The complete workflow, no download, no Ableton required at the time of editing:

1. In Live, save the rack to disk: click the disk icon in the rack's title bar, or drag the rack into the browser. This produces an `.adg` in the User Library. Required, see Constraint 2.
2. Open the site. Drag the `.adg` onto the page.
3. The macro bank appears on one side, the device tree on the other. Drag macro 2 onto macro 3 to move its mapping. Or click a parameter in the tree, then click a macro, to bind it there.
4. Click **Save**. The browser downloads the modified `.adg`.
5. In Live, drag the downloaded file from the browser onto the rack to reload it.

This tier works offline after first load (Phase 4.3), works on a machine with no Ableton installed at all, and is the fallback whenever anything in Tier 1 misbehaves.

### Tier 1: the companion device, editor included

No browser tab at all. The device carries the same editor and adds what only Live can supply: knowing which rack is selected, and what its parameters are doing right now.

Install once:

1. On the site, click **Download companion device**. Gets `RackEditor.amxd`.
2. Drop it into the Ableton User Library, or drag it straight onto a track. Audio effect with a passthrough chain, so it does not alter the sound of the track it sits on.

Then, per session:

3. Click the rack in Live. The device shows its name, confirming the target, and can enumerate its live device tree, so parameters can be picked from what is actually loaded rather than from the file alone.
4. Save the rack to disk as in Tier 0 step 1. The device pre-fills the expected filename from the targeted device's name, as a suggestion to confirm, never an automatic load (Constraint 2).
5. Click **Open Editor**. A floating window appears, because the device view itself is only 169px tall and does not scroll. Same editor as the website.
6. Edit as in Tier 0. Macro knobs now show live positions alongside stored values.
7. Save. Writes straight back to the original path, no downloads folder.
8. Reload in Live by dragging, or try the experimental reload button (Phase 6).

### The device bundles the site, it does not fetch it

Worth stating up front because it collapses a lot of complexity: `m4l-jweb` can ship a web app offline inside the `.amxd`, and m4l-strudel already proves this at scale. That device runs the real `@strudel/core` engine headlessly inside a MIDI device, explicitly with no browser tab, plus a sample browser that downloads files next to the device. If a full live-coding engine and its sample universe fit in an `.amxd`, an XML editor certainly does.

So the companion is not a thin remote that needs a live connection back to a website. It contains the entire editor. Same build artifact, two delivery targets:

- **GitHub Pages** serves it as a website.
- **The `.amxd`** bundles the same `dist/` and serves it from disk.

Consequences that shape everything downstream:

- No network dependency inside Live. Works on a plane, works airgapped.
- No online/offline fallback logic, no version skew between a hosted UI and an installed device, no CORS.
- The cross-process bridge (Phase 5.5) becomes optional rather than central, since anyone who installs the device gets the full editor plus live data in one process.

Tier 1 below therefore means "the editor, running inside Live, with live targeting", not "the website talking to a helper".

### What this tool cannot do

- It cannot change mappings on a rack live, in place, while Live is running. Every edit goes through the file. Constraint 1 explains why.
- It cannot find the rack's file automatically, even with the companion installed. Constraint 2.
- It will not preserve mappings made after the rack was last saved to disk. The file is the source of truth.

---

## Part 2: Constraints

These are the load-bearing facts. Do not design around them without re-verifying them first.

### Constraint 1: Mapping targets are not exposed to code

The Live Object Model exposes a macro's current value as a `DeviceParameter`, and that value is observable. It does not expose which parameter a macro drives. Not through Max's `LiveAPI`, not through a Python Remote Script, not through AbletonOSC (whose own docs list `RackDevice` and `Chain` as incompletely exposed).

State this as "not exposed to code", never as "the mapping exists only in the file". Live plainly knows it at runtime and shows it: right-click a macro knob and the context menu reads "Remove Mapping to \<rack\> | \<chain\> | \<parameter\>", naming the target exactly. The limit is the API surface, not Live's knowledge.

Compounding it: a Max for Live device reaches its own device chain far more readily than an arbitrary rack elsewhere in the set, and the rack the user wants to edit is generally not the one hosting the editor.

Consequence: creating, moving, or deleting a binding is a file operation. There is no live API call for it. Everything in this plan follows from that.

### Constraint 2: A live device has no pointer to its source file

Once a rack is on a track it is part of the Live Set's state, serialized into the `.als`. There is no `device.file_path` property. Two devices loaded from the same preset, then edited differently, are indistinguishable by origin.

Consequence: the user must explicitly save the rack to disk, and must explicitly choose the file. A filename-based guess can be offered as a suggestion. It must never auto-load, because a stale file with a matching name is worse than no file.

### Constraint 3: Macro index is not LOM parameter index

For a rack device, `device.parameters[0]` is Device On. `parameters[1]` is typically Chain Selector. Macros follow after that. The offset is not guaranteed stable across rack types (drum racks and instrument racks differ).

Consequence: never assume `parameters[i]` is macro `i`. Build the mapping empirically at runtime by matching parameter names, and verify against a real rack before trusting it. Getting this wrong shows correct values on the wrong knobs, a subtle and confusing bug.

### Constraint 4: Macro Variations are indexed by macro slot

A rack's variations store a snapshot of values per macro index. Moving a binding from macro 2 to macro 3 without permuting the stored variation values silently breaks every variation in the rack: the old macro-2 value is written to a now-unmapped slot, and macro 3 drives the moved parameter with an unrelated stored value.

Consequence: every mutation that changes macro slots must permute variation value arrays identically. This is the single easiest way to corrupt a rack. It is tested explicitly in Phase 2.

### Constraint 5: A parameter can only be driven by one macro

Live enforces this in its UI. The file format allows expressing a violation. Mutations must clear the previous owner when rebinding.

### Constraint 6: Macro count is 1 to 16, configurable per rack

Since Live 11 the visible macro count is adjustable. Do not hardcode 8 or 16.

### Verification status

Constraints 1 and 2 are well established. Constraints 3, 4, 5 follow from documented Live behavior but the exact XML representation is unverified, see Phase 1. Treat Phase 1 as the step that turns these from "expected" into "known."

---

## Part 3: Repo layout

Monorepo, pnpm workspaces.

```
ableton-rackutils/
  packages/
    adg-codec/          # parse, mutate, serialize .adg. Zero UI deps.
    editor-ui/          # shared React components. Zero Ableton deps.
    bridge-protocol/    # shared message types for site <-> companion
  apps/
    site/               # the product. Static, deployed to GitHub Pages.
    m4l-device/         # optional companion .amxd, built with m4l-jweb
  tools/
    adg-tool/        # CLI for the Phase 1 schema investigation
```

Rules that keep the tiers honest:

- `adg-codec` must not import React, and must run identically in Node (for tests) and browser.
- `editor-ui` must not import anything from `@m4l-jweb`. It receives live data as plain props, so it renders the same whether the companion is present or absent.
- `apps/site` must never import from `apps/m4l-device`. The site has to build and deploy with the device removed entirely.
- `bridge-protocol` is types only, no runtime dependency on either side, so the two can be versioned independently (Phase 5.5).

The build must stay a pure static build. No server-side rendering, no API routes, nothing that assumes a Node process at runtime.

---

## Phase 1: Schema investigation

**Do this first. Do not write `mutate.ts` before it is done.**

Nobody involved has Ableton's `.adg` schema memorized precisely enough to write mapping mutation code from memory. Any element names appearing below are plausible guesses, not verified facts. This phase replaces guesses with observations from real files.

Patchbay (`github.com/alienmind/patchbay`) documents much of this already in `doc/ARCHITECTURE.md` and `doc/SCHEMA.md` for Live 12.4.3. Read those first, then verify against your own racks rather than trusting either source blindly.

### 1.1 Inspection CLI

```typescript
// tools/adg-tool/src/index.ts
import { gunzipSync } from "zlib";
import { readFileSync } from "fs";
import * as prettier from "prettier";

// .adg is a single gzipped XML document. Nothing more exotic than that.
export function unpack(path: string): string {
  const xml = gunzipSync(readFileSync(path)).toString("utf8");
  return prettier.format(xml, { parser: "html", printWidth: 120 });
}

// CLI: adg-tool unpack rack.adg > rack.xml
```

### 1.2 The diff procedure

For each question below, produce two files differing in exactly one way, then diff.

```bash
# 1. Save a rack as A.adg
# 2. In Live, make exactly one change
# 3. Save as B.adg
adg-tool unpack A.adg > A.xml
adg-tool unpack B.adg > B.xml
diff A.xml B.xml
```

Ableton regenerates `Id`, `PointeeId`, `LomId`, and `LomIdView` on every save, so raw diffs are noisy. Filter them:

```typescript
// tools/adg-tool/src/normalize.ts
const VOLATILE = new Set(["Id", "PointeeId", "LomId", "LomIdView"]);

export function normalize(doc: Document): Document {
  const walk = (el: Element) => {
    for (const attr of [...el.attributes]) {
      if (VOLATILE.has(attr.name)) el.removeAttribute(attr.name);
    }
    [...el.children].forEach(walk);
  };
  walk(doc.documentElement);
  return doc;
}
```

Caveat: these ids are volatile in the sense that they change between saves, but they are also structurally load-bearing, since a mapping references its target by id. Filtering makes diffs readable. It does not mean they can be ignored when writing. Phase 2.4 covers that.

### 1.3 Questions to answer, in order

Record answers in `packages/adg-codec/SCHEMA.md`, each with the diff output that proves it.

1. **Where does a macro's mapping live?** Change a macro from unmapped to mapped. Diff. Expect a new subtree.
2. **How is the target identified?** By id reference, by path string, or both? This determines whether moving a mapping is a cheap node move or requires rewriting references.
3. **What does moving a mapping from macro 2 to macro 3 change?** This diff is the specification for `moveMapping`.
4. **Where are range and inversion stored?** Set a non-default mapping range, then invert it (min > max). Two separate diffs.
5. **Where are variations stored, and how are they keyed?** Build a rack with three variations, diff against the same rack with two. Confirm the per-macro value array is positional (Constraint 4).
6. **What happens to variations when Live itself moves a mapping?** Repeat question 3 on a rack that has variations. This defines correct behavior and is the reference for the Phase 2 test.
7. **Where is the macro count stored?** (Constraint 6.)
8. **How is nesting represented?** Use a DR1-style rack: Drum Rack, then pad rack, then Pitch, then engine rack. Confirm the recursion is uniform at each level, or document where it is not.

### 1.4 Exit criteria

`SCHEMA.md` answers all eight questions with supporting diffs, tested against at least three structurally different racks: a simple instrument rack, a drum rack, and a deeply nested one. Only then start Phase 2.

---

## Phase 2: `adg-codec`

**Built.** The design decision below (2.1) held up. The type/API sketches in
2.2/2.3 were written before SCHEMA.md was confirmed and are pre-implementation
guesses, superseded in a few concrete ways by what's actually in
`packages/adg-codec/src/model.ts` and `mutate.ts` - notably `Binding` has no
`targetId` (SCHEMA.md Q1/Q2: mappings are containment-addressed, not id-
addressed), and `DeviceNode`/`ParamRef` use a `path` (an index-chain relative
to the rack's `BranchPresets`, see `dom.ts`'s `pathOf`/`resolvePath`) rather
than an opaque `id`. Read the source for the real shape; treat what follows as
historical design reasoning, not a spec to match exactly.

### 2.1 Design decision: the DOM is the source of truth

Two viable designs:

- **A.** Keep the parsed DOM. Mutations edit the DOM. The typed model is a read-through view, recomputed after each mutation.
- **B.** Parse into a pure data model, discard the DOM, rebuild XML at serialize time.

**Choose A.** B guarantees losing anything the parser did not model, and a rack contains a great deal (device state, sample references, warp markers, unknown future elements) that this tool has no reason to understand. A only touches what it edits.

Consequence for the API: mutations are not pure functions over a plain object. Do not pretend otherwise, that was a bug in an earlier draft of this plan, where a `raw: XMLDocument` field sat inside a supposedly immutable model and made "returns a new model" false. Make copying explicit and cheap instead:

```typescript
// packages/adg-codec/src/model.ts

/** Opaque handle owning a mutable DOM. Clone before mutating to keep the old one. */
export class Rack {
  private constructor(private doc: Document) {}

  static parse(bytes: Uint8Array): Rack;
  clone(): Rack;                 // deep-clones the DOM, for undo stacks
  serialize(): Uint8Array;

  get name(): string;
  get macroCount(): number;            // 1..16, Constraint 6
  get macros(): readonly Macro[];      // recomputed from DOM on access
  get chains(): readonly Chain[];
  get variations(): readonly Variation[];
}
```

Undo/redo becomes a stack of clones, which is honest about the cost rather than hiding it behind fake immutability.

### 2.2 Types

**Correction, from `SCHEMA.md` Q1/Q2 (borrowed from `alienmind/patchbay`,
pending our own confirming diff):** a mapping is not id-addressed. It is a
`KeyMidi` element inserted as a CHILD of the target parameter itself; the
macro index lives on that `KeyMidi`'s `NoteOrController`. There is no id, no
pointer, no path string anywhere in the mapping. `Binding.targetId` below is
therefore wrong and should not be implemented as written - drop it, and note
that `moveMapping` becomes correspondingly simpler: it edits `NoteOrController`
on the existing `KeyMidi` in place, it does not relocate any node or
reconcile any id. See `SCHEMA.md` Q1-Q4 before implementing this section.

```typescript
export interface Macro {
  index: number;                 // 0-based slot
  name: string;
  value: number;                 // stored position, 0..127
  binding: Binding | null;
}

export interface Binding {
  targetPath: string;            // locates the target element (it owns the KeyMidi) and displays in the UI
  rangeMin: number;
  rangeMax: number;
  inverted: boolean;             // Min > Max on MidiControllerRange; Live honours it (SCHEMA.md Q4)
}

export interface Chain {
  id: string;
  name: string;
  devices: DeviceNode[];
}

export interface DeviceNode {
  id: string;                    // stable within one parse, used as React key
  path: string;                  // positional, e.g. "0/2/1", for display and debugging
  type: string;                  // "Operator", "Saturator", "InstrumentGroupDevice"
  name: string;                  // user-visible, may be renamed
  isRack: boolean;
  chains: Chain[];               // empty for leaf devices
  parameters: ParamRef[];
}

export interface ParamRef {
  id: string;
  name: string;
  path: string;
  boundToMacro: number | null;   // reverse index, so the tree can show what is taken
}

export interface Variation {
  index: number;
  name: string;
  values: number[];              // length === macroCount, positional. Constraint 4.
}
```

`DeviceNode.chains` is a plain recursive interface. An earlier draft typed this as `ReturnType<typeof useDeviceTree>`, which is circular and TypeScript rejects it.

### 2.3 Mutations

All mutations are functions taking a `Rack`, mutating in place, returning a result. Clone first to keep the previous state.

```typescript
// packages/adg-codec/src/mutate.ts

export interface MutationResult {
  ok: boolean;
  warnings: string[];    // e.g. "cleared existing binding on macro 5"
}

/**
 * Move the binding at `from` to `to`. If `to` is already mapped its binding is
 * cleared and reported in warnings.
 * Permutes variation values in lockstep. Constraint 4.
 */
export function moveMapping(rack: Rack, from: number, to: number): MutationResult;

/** Exchange bindings, names, stored values, and all variation values between two slots. */
export function swapMacros(rack: Rack, a: number, b: number): MutationResult;

/**
 * Bind a parameter to a macro. Clears any macro already driving that parameter
 * (Constraint 5) and any binding already on this macro.
 */
export function bindParameter(
  rack: Rack,
  macroIndex: number,
  target: ParamRef,
  range?: { min: number; max: number; inverted: boolean },
): MutationResult;

export function unbindMacro(rack: Rack, macroIndex: number): MutationResult;
export function renameMacro(rack: Rack, macroIndex: number, name: string): MutationResult;
```

Variation permutation, the part that must not be forgotten:

```typescript
// Every slot-changing mutation routes through this.
function permuteVariations(rack: Rack, permute: (values: number[]) => number[]): void {
  for (const variation of rack.variationElements()) {
    writeVariationValues(variation, permute(readVariationValues(variation)));
  }
}

// moveMapping: the value follows the binding, the source slot resets.
const moveValues = (from: number, to: number) => (values: number[]) => {
  const next = [...values];
  next[to] = values[from];
  next[from] = DEFAULT_MACRO_VALUE;   // confirm against Phase 1 Q6
  return next;
};

// swapMacros:
const swapValues = (a: number, b: number) => (values: number[]) => {
  const next = [...values];
  [next[a], next[b]] = [values[b], values[a]];
  return next;
};
```

Whether a vacated slot should get 0, 64, or the macro's own default is an empirical question. Answer it from Phase 1 Q6 by observing what Live does, then match it.

### 2.4 Id handling

Per Phase 1 Q2, mappings reference targets by id. Two rules:

1. **Never invent ids.** When moving a binding, move the existing reference. Do not renumber.
2. **Never reuse an id across different objects.** If a mutation genuinely requires a new element, allocate above the current maximum.

```typescript
function maxId(doc: Document): number {
  let max = 0;
  for (const el of doc.querySelectorAll("[Id]")) {
    const n = Number(el.getAttribute("Id"));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max;
}
```

Getting this wrong produces a file that opens without complaint and behaves incorrectly, the worst available failure mode. Prefer moving existing nodes over constructing new ones wherever the schema allows.

### 2.5 gzip

```typescript
// packages/adg-codec/src/gzip.ts
import { gzip, ungzip } from "pako";

export const decompress = (bytes: Uint8Array): string =>
  new TextDecoder().decode(ungzip(bytes));

export const compress = (xml: string): Uint8Array =>
  gzip(new TextEncoder().encode(xml));
```

Use pako, not `CompressionStream`. Synchronous, identical in Node and browser, and avoids an unknown about which Chromium build `jweb` embeds.

### 2.6 Tests

```typescript
// Byte comparison always fails: gzip embeds an MTIME header and compression
// levels differ by implementation. Compare normalized XML instead.
function assertEquivalent(a: Uint8Array, b: Uint8Array) {
  const parse = (x: Uint8Array) =>
    normalize(new DOMParser().parseFromString(decompress(x), "text/xml"));
  expect(serializeXml(parse(a))).toEqual(serializeXml(parse(b)));
}

test("roundtrip is lossless", () => {
  for (const fixture of ALL_FIXTURES) {
    const bytes = readFileSync(fixture);
    assertEquivalent(bytes, Rack.parse(bytes).serialize());
  }
});

test("moveMapping transfers the binding", () => {
  const rack = Rack.parse(readFileSync("fixtures/simple.adg"));
  const before = rack.macros[1].binding!;
  moveMapping(rack, 1, 2);
  expect(rack.macros[2].binding).toMatchObject({ targetPath: before.targetPath });
  expect(rack.macros[1].binding).toBeNull();
});

// Constraint 4. This test is what prevents silently corrupting racks.
test("moveMapping permutes variation values", () => {
  const rack = Rack.parse(readFileSync("fixtures/with-variations.adg"));
  const before = rack.variations.map(v => [...v.values]);
  moveMapping(rack, 1, 2);
  rack.variations.forEach((v, i) => {
    expect(v.values[2]).toBe(before[i][1]);
    expect(v.values[1]).toBe(DEFAULT_MACRO_VALUE);
  });
});

// Constraint 5.
test("binding a taken parameter clears the previous owner", () => {
  const rack = Rack.parse(readFileSync("fixtures/simple.adg"));
  const target = rack.macros[1].binding!;
  const result = bindParameter(rack, 4, paramRefFor(target));
  expect(rack.macros[1].binding).toBeNull();
  expect(result.warnings).toHaveLength(1);
});

// The strongest available test: does our output match what Live itself produces?
test("matches Live's own output for the same edit", () => {
  const ours = Rack.parse(readFileSync("fixtures/move-before.adg"));
  moveMapping(ours, 1, 2);
  assertEquivalent(ours.serialize(), readFileSync("fixtures/move-after-live.adg"));
});
```

That last test is worth its setup cost. Produce `move-after-live.adg` by hand in Live during Phase 1 Q6. If our output matches Live's, the implementation is correct in a way no amount of self-consistent unit testing can establish.

### 2.7 Exit criteria

All tests pass against at least three structurally different fixtures. Load a round-tripped rack in Live and confirm by ear and eye that nothing changed. Separately, load one where a mapping was moved and confirm the variations still behave.

---

## Phase 3: `editor-ui`

Pure React. No Ableton dependency. Consumed by both surfaces.

### 3.1 Container

```tsx
// packages/editor-ui/src/RackEditor.tsx
export interface RackEditorProps {
  onSave: (bytes: Uint8Array, suggestedName: string) => void | Promise<void>;
  /** Live parameter values keyed by macro index. Surface B only. Display only,
   *  never written back to the file. */
  liveValues?: Record<number, number>;
  /** Optional pre-filled load suggestion. Never auto-loads. */
  suggestion?: { path: string; label: string };
}

export function RackEditor({ onSave, liveValues, suggestion }: RackEditorProps) {
  const [rack, setRack] = useState<Rack | null>(null);
  const [undo, setUndo] = useState<Rack[]>([]);
  const [armed, setArmed] = useState<ParamRef | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Every mutation goes through here so undo and warnings are never forgotten.
  const apply = useCallback((fn: (r: Rack) => MutationResult) => {
    if (!rack) return;
    setUndo(u => [...u.slice(-49), rack.clone()]);
    const result = fn(rack);
    setWarnings(result.warnings);
    setRack(rack.clone());              // new reference so React re-renders
  }, [rack]);

  return (
    <div className="editor">
      <Toolbar
        onLoad={bytes => { setRack(Rack.parse(bytes)); setUndo([]); }}
        onSave={() => rack && onSave(rack.serialize(), `${rack.name}.adg`)}
        onUndo={() => {
          const prev = undo.at(-1);
          if (prev) { setRack(prev); setUndo(u => u.slice(0, -1)); }
        }}
        canUndo={undo.length > 0}
        suggestion={suggestion}
      />
      {warnings.length > 0 && <WarningBar warnings={warnings} />}
      {rack && (
        <div className="panes">
          <MacroBank
            macros={rack.macros}
            liveValues={liveValues}
            armed={armed}
            onMove={(from, to) => apply(r => moveMapping(r, from, to))}
            onSwap={(a, b) => apply(r => swapMacros(r, a, b))}
            onBindArmed={i => { if (armed) { apply(r => bindParameter(r, i, armed)); setArmed(null); } }}
            onUnbind={i => apply(r => unbindMacro(r, i))}
            onRename={(i, n) => apply(r => renameMacro(r, i, n))}
          />
          <DeviceTree chains={rack.chains} armed={armed} onArm={setArmed} />
        </div>
      )}
    </div>
  );
}
```

### 3.2 Device tree

```tsx
// Keys use node.id, never name or type. Two Saturators in one chain, or two
// drum pads with default names, would collide otherwise.
function DeviceTree({ chains, armed, onArm }: DeviceTreeProps) {
  return (
    <ul className="tree">
      {chains.map(chain => (
        <li key={chain.id}>
          <span className="chain-name">{chain.name}</span>
          <ul>
            {chain.devices.map(device => (
              <DeviceRow key={device.id} device={device} armed={armed} onArm={onArm} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function DeviceRow({ device, armed, onArm }: DeviceRowProps) {
  const [open, setOpen] = useState(false);   // collapsed by default, see note
  return (
    <li>
      <button onClick={() => setOpen(o => !o)}>{open ? "▾" : "▸"} {device.name}</button>
      {open && (
        <>
          <ul className="params">
            {device.parameters.map(p => (
              <li key={p.id}>
                <button
                  className={armed?.id === p.id ? "armed" : p.boundToMacro !== null ? "bound" : ""}
                  onClick={() => onArm(p)}
                >
                  {p.name}
                  {p.boundToMacro !== null && <span className="badge">M{p.boundToMacro + 1}</span>}
                </button>
              </li>
            ))}
          </ul>
          {device.isRack && <DeviceTree chains={device.chains} armed={armed} onArm={onArm} />}
        </>
      )}
    </li>
  );
}
```

Collapsed by default matters. A drum rack with 16 pads, each holding a nested engine rack, expands to thousands of parameter rows. It also gates how many live listeners Surface B attaches (Phase 5).

### 3.3 Macro bank

Two interactions, deliberately:

- **Drag a macro onto another macro.** Moves the mapping. Primary gesture, matches the stated goal (move the mapped function from knob 2 to knob 3). Hold a modifier while dropping to swap instead, and label this in the UI, since the difference matters.
- **Arm a parameter in the tree, then click a macro.** Creates a new binding. Patch-cable metaphor.

HTML5 drag and drop is sufficient for a 16-item grid, no dependency needed.

```tsx
function MacroSlot({ macro, liveValue, onMove, onSwap }: MacroSlotProps) {
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData("text/macro-index", String(macro.index))}
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData("text/macro-index"));
        if (from === macro.index) return;
        (e.shiftKey ? onSwap : onMove)(from, macro.index);
      }}
    >
      <div className="knob" style={{ "--angle": `${(macro.value / 127) * 270 - 135}deg` }} />
      {liveValue !== undefined && (
        <div className="live-indicator" style={{ "--angle": `${(liveValue / 127) * 270 - 135}deg` }} />
      )}
      <label>{macro.name || `Macro ${macro.index + 1}`}</label>
      <small>{macro.binding?.targetPath ?? "unmapped"}</small>
    </div>
  );
}
```

Render the live indicator as visually distinct from the stored value. They are different things (Constraint 1: the file has bindings and stored values, the LOM has current positions) and conflating them in the UI invites conflating them in the code.

---

## Phase 4: The site

This is the product. Everything before it is a library, everything after it is optional.

### 4.1 App shell

```tsx
// apps/site/src/App.tsx
export default function App() {
  const companion = useCompanion();   // Phase 5.5. Returns a disconnected stub if absent.

  return (
    <Layout>
      <RackEditor
        liveValues={companion.liveValues}
        suggestion={companion.suggestedFile}
        onSave={companion.connected ? companion.saveInPlace : downloadFile}
      />
      <CompanionBanner state={companion.state} />
    </Layout>
  );
}

function downloadFile(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
```

`useCompanion` must return a valid disconnected stub when nothing is running, with no thrown errors, no retry spinner blocking the UI, and no console noise. The overwhelmingly common case is no companion at all, and that path has to feel like the intended one rather than a degraded one.

### 4.2 Static build for GitHub Pages

Adapted from `alienmind/trackster`, which already solves this. The key idea is
that `base` comes from an env var rather than being hardcoded or sniffed from
`GITHUB_ACTIONS`, so the same config serves three cases: local dev (`/`), Pages
(`/<repo>/`), and the device bundle (`./`).

```typescript
// apps/site/vite.config.ts
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      scope: process.env.VITE_BASE || '/',
      manifest: {
        start_url: process.env.VITE_BASE || '/',
        name: 'rackutils',
        display: 'standalone',
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5_000_000,
        // Do not let the SPA fallback swallow non-HTML assets.
        navigateFallbackDenylist: [/.*\.(adg|als|md|zip)$/i],
      },
    }),
  ],
});
```

The workflows are committed at `.github/workflows/`. Three of them:

- `ci.yml` - lint, typecheck, codec tests, on every PR.
- `deploy.yml` - Pages, with `VITE_BASE: /${{ github.event.repository.name }}/`
  so it is repo-name agnostic. Codec tests gate the deploy: a broken codec
  corrupts racks silently, which is worse than the site being down.
- `release-device.yml` - on `device-v*` tags, builds the embedded bundle with
  `VITE_BASE: './'`, builds the `.amxd`, and publishes it as a release asset.
  Includes a grep guard that fails the build if absolute asset paths leak into
  the bundle, since that is the top device-side failure mode.

Two open questions in `release-device.yml`, both marked in the file: whether the
`m4l-jweb` device build needs macOS and a Max toolchain (currently assumed, and
macOS runners bill roughly 10x Linux), and the exact output paths for the
`.amxd` and the embedded web directory.

Gotchas specific to this host:

- Add `.nojekyll` to the artifact root, or files and folders starting with an
  underscore get silently dropped.
- If client-side routing is ever added, copy `index.html` to `404.html`, since
  Pages has no rewrite rules. Better: do not add routing, one page is enough.
- Pages is HTTPS only, which is what made the companion bridge awkward before
  bundling removed the need for it.

### 4.3 Offline

`vite-plugin-pwa` with `registerType: 'autoUpdate'`, configured above. Trackster
uses exactly this to run "even in the most isolated techno bunker", which is the
same requirement here: someone mid-session with a DAW open should not be blocked
by a flaky connection.

Skip the PWA plugin entirely in the device build. Bundling already solves
offline, and a service worker there only adds a caching layer that can serve
stale UI after a device update.

### 4.3b File System Access API

Trackster uses this, and it is a better fit than the download-a-copy flow this
plan originally assumed.

`showOpenFilePicker()` returns a handle that can be written back through
`createWritable()`, so the site can save the modified `.adg` directly over the
original file. No downloads folder, no manual move, no companion device needed.

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

Consequences:

- Save-in-place moves from Tier 1 to Tier 0. The companion is now purely about
  targeting and live values.
- Reuse trackster's `src/types/file-system-access.d.ts` rather than rewriting it.
- Firefox and Safari support is weaker than Chromium's, so keep the
  `<input type="file">` plus download path as an automatic fallback, and detect
  rather than assume.
- Writing over the user's original file raises the stakes on Constraint 4.
  Follow trackster's precedent and default to a read-only or simulated mode,
  requiring an explicit opt-in before any destructive write.

### 4.4 Landing page

The site has to answer three questions above the fold, because the ask (drag a project file into a web page) sounds worse than it is:

1. **What it does.** One line, plus a screenshot of the macro bank mid-drag.
2. **Where the file goes.** Nowhere. Parsed in the tab, never uploaded, no server exists to upload to. Link the repo so the claim is checkable.
3. **What it costs.** Nothing, no account.

Then, below: **Download companion device (optional)**, clearly marked as an enhancement, with one line on what it adds (targeting and live values) and what it requires (Live 12, Max for Live).

### 4.5 Shipping the companion from the site

**Built** (`apps/site/src/companion/download.ts`, `CompanionDownload.tsx`),
with one change from the sketch below: `release-device.yml` now runs on every
push to `main` (not a manual `device-vX` tag - there's no real versioning
scheme yet), always overwriting the same rolling release at a fixed tag,
`latest-device`, marked `prerelease: true`. That means the site can't use
`/releases/latest` - GitHub's own docs say that endpoint excludes prereleases
and drafts - it fetches `/releases/tags/latest-device` instead. The `.amxd`
is a release asset either way, not a file in the repo, so the site is not
rebuilt to ship a device update.

```typescript
// apps/site/src/companion/download.ts
const RELEASE_TAG_URL = "https://api.github.com/repos/alienmind/ableton-rackutils/releases/tags/latest-device";

export async function latestCompanion(): Promise<{ url: string; builtAt: string } | null> {
  try {
    const res = await fetch(RELEASE_TAG_URL);
    if (!res.ok) return null;
    const release = await res.json();
    const asset = release.assets.find((a: any) => a.name.endsWith(".amxd"));
    return asset ? { url: asset.browser_download_url, builtAt: release.published_at } : null;
  } catch {
    return null;   // offline, rate-limited, whatever. Fall back to a static link.
  }
}
```

Always render a hardcoded fallback link if this returns null. GitHub's unauthenticated API is rate-limited per IP and will occasionally fail for reasons having nothing to do with the user.

Once the codec's own versioning matures enough for real `device-vX` releases
to make sense, revisit: either the site should prefer a real tagged release
over the rolling one, or the rolling-build concept should retire entirely in
favor of tagged releases only.

This matches how m4l-strudel distributes: a zip of devices on GitHub Releases, with a maxforlive.com listing pointing at it. Worth listing there too once stable, it is where people actually look for devices, and it costs one form submission. Note that maxforlive lists a single device file, so if this ever grows to multiple devices, ship a zip bundle like m4l-strudel does rather than fighting the form.

Also worth stating on the download page: an `.amxd` is executable content, and installing one is a real trust decision. Link the source and the build workflow so the artifact is reproducible from the repo.

### 4.6 Exit criteria

Deployed, loads over HTTPS, round-trips a real rack, and does all of it with the companion never installed. Ship it here. Everything after this point is optional improvement on a working product.

---

## Phase 5: The companion device (optional)

Nothing here blocks the product. The site already works. This phase makes targeting and parameter-picking easier for people who install it, and every capability below must degrade to absent without breaking the site.

`m4l-jweb` is the author's own framework, so gaps here are build tasks rather than blockers.

### 5.1 Framework capabilities needed

**5.1.1 Native file picker inside `jweb`.** Only matters for Tier 2 (the UI running inside Live). Does `<input type="file">` open a real OS dialog, in both `pnpm dev` and an installed `.amxd`? If it cannot be made to work, Tier 2 falls back to accepting a typed path read via the Max side, and Tiers 0 and 1 are unaffected since they run in a real browser.

**5.1.2 Runtime-chosen parameter watching.** `defineWatch()` as documented appears built for properties known at surface-definition time. Needed here: paths chosen by the user mid-session.

```typescript
// One hook taking a list. Not one hook per parameter, hook count must not vary
// with array length.
function useLiveParameters(
  devicePath: LomPath | null,
  parameterIndices: number[],
): Record<number, number>;
```

Implementation: a generic `live.observer` pool on the Max side that attaches and detaches by path at runtime, pushing changes over the existing bridge.

**5.1.3 Device tree enumeration.** A plain async function, not a hook, since it is called on demand rather than subscribed to.

```typescript
interface LiveDeviceNode {
  name: string;
  className: string;
  path: LomPath;
  isRack: boolean;
  parameters: { index: number; name: string }[];
  chains: { name: string; devices: LiveDeviceNode[] }[];
}

function fetchDeviceTree(path: LomPath): Promise<LiveDeviceNode>;
```

Its main job here is resolving Constraint 3: matching macro names from the file against LOM parameter indices, so the live overlay lands on the right knobs.

**5.1.4 Selected-device tracking.** Better than the originally proposed enable/disable toggle trick:

```typescript
function useSelectedDevice(): { name: string; path: LomPath } | null;
```

Backed by `song.view.selected_track.view.selected_device`, which is observable. The user clicks the device, which they were going to do anyway. The toggle approach had a real side effect (momentarily bypassing the device cuts held notes) and required watching every sibling. If a toggle fallback is still wanted, observe `parameters[0]` (Device On), which is definitively a `DeviceParameter`, rather than `is_active`.

**5.1.5 Hotswap reload (experimental, optional).** See Phase 6.

### 5.2 Device definition

```javascript
// apps/m4l-device/patcher/devices.mjs
export default [{
  name: "rack-editor",
  type: "audio",
  chains: ["passthrough"],   // safe on any track, does not alter the signal
  unmatchedTo: "js",
}];
```

```typescript
// apps/m4l-device/src/surface.ts
export default defineSurface({
  params: {},                 // a tool, not an instrument, no automatable params
  windows: {
    editor: window({ title: "Rack Editor", width: 1000, height: 720, entry: "Editor" }),
  },
  state: {
    lastFilePath: state({ default: null as string | null }),
  },
});
```

### 5.3 Device view

169px, no scrolling. A launcher and a status line, nothing else.

```tsx
export default function App() {
  const selected = useSelectedDevice();
  const editorWindow = useWindow(surface, "editor");
  return (
    <div className="device-view">
      <div className="target">{selected ? selected.name : "Select a rack in Live"}</div>
      <button onClick={editorWindow.open} disabled={!selected}>Open Editor</button>
    </div>
  );
}
```

### 5.4 Editor window

```tsx
export default function Editor() {
  const selected = useSelectedDevice();
  const [rackTree, setRackTree] = useState<LiveDeviceNode | null>(null);
  const [visibleMacros, setVisibleMacros] = useState<number[]>([]);

  useEffect(() => {
    if (selected) fetchDeviceTree(selected.path).then(setRackTree);
  }, [selected?.path]);

  // Constraint 3: resolve macro slot to LOM parameter index by name, do not
  // assume they align. parameters[0] is Device On, not macro 0.
  const paramIndices = useMemo(
    () => visibleMacros.map(m => resolveMacroParamIndex(rackTree, m)).filter(i => i !== null),
    [rackTree, visibleMacros],
  );

  const liveValues = useLiveParameters(selected?.path ?? null, paramIndices);

  return (
    <RackEditor
      liveValues={liveValues}
      suggestion={selected ? { path: guessPresetPath(selected.name), label: selected.name } : undefined}
      onSave={(bytes, name) => saveToFile(name, bytes)}
    />
  );
}
```

`guessPresetPath` globs the User Library for a filename match and returns a suggestion for the load dialog. It never reads the file (Constraint 2). If the rack was renamed or never saved, the suggestion is simply absent and the plain file picker still works.

Attach live listeners only for currently visible macros, and detach on unmount. A deeply nested rack has hundreds of parameters and eagerly watching all of them will not end well.

### 5.5 Bundling the site into the device

This is the main packaging step, and it is well-trodden ground: m4l-strudel ships the full `@strudel/core` engine plus a sample browser inside `.amxd` files, running headlessly with no browser tab. Bundling a static React app is a smaller version of the same thing.

Build once, ship twice. The same `apps/site/dist` output is both the Pages artifact and the device payload:

```javascript
// apps/m4l-device/build.mjs
import { cp } from "node:fs/promises";

// Site must be built with VITE_BASE="./" for the device copy. An absolute
// "/ableton-rackutils/" path resolves against the filesystem root when
// loaded from disk inside jweb and 404s into a blank window.
await cp("../site/dist", "./patcher/web", { recursive: true });
```

Both build modes come from the single `VITE_BASE` env var wired up in Phase 4.2,
so there is no separate device config to keep in sync. `release-device.yml`
passes `VITE_BASE: './'` and `VITE_EMBED: '1'`, then asserts no absolute asset
paths survived into the bundle.

Checklist for the device build, most of which the site already satisfies because it was designed backend-free:

- Relative asset paths (`base: "./"`).
- No absolute-root fetches, no CDN imports at runtime. Everything vendored at build time.
- Hide the landing copy, the download button, and the Pages-specific analytics when embedded. A build-time flag is cleaner than a URL parameter here, since the bundle already differs.
- Skip the service worker in the device build. It solves a problem (offline) that bundling has already solved, and adds a caching layer that can serve stale UI after a device update.

Version the two together. The device reports the bundled site version in its UI, so a bug report from inside Live is traceable to a commit.

### 5.6 The loopback bridge (probably unnecessary)

Bundling removes the reason this existed. It is only worth building for one narrow case: someone who has the device installed but prefers editing in a real browser tab, wanting live values there. That is a small audience and a large amount of machinery.

Documented here so the tradeoff is on record rather than rediscovered.

**The problem.** The site is served from `https://` on GitHub Pages. The companion runs on the user's own machine. Browsers block mixed content, so an HTTPS page normally cannot open an insecure connection.

**Why it may still work.** Browsers treat loopback (`127.0.0.1`, and `localhost` where it resolves to loopback) as a potentially trustworthy origin, which is what makes local-companion architectures viable at all. Support has historically differed between engines, and the rules around local network access have been tightening, so this needs verifying per browser rather than assuming.

**Spike this before building anything else in Phase 5.** Half a day, and the answer determines the design:

1. Serve a trivial page over HTTPS.
2. Run a local WebSocket server on `127.0.0.1`.
3. Try to connect from the page. Test Chrome, Firefox, and Safari, on macOS and Windows.
4. Record the result, including whether any permission prompt appears.

**If loopback WebSocket works**, that is the design:

```typescript
// packages/bridge-protocol/src/index.ts
export const BRIDGE_PORT = 9770;
export const PROTOCOL_VERSION = 1;

export type FromCompanion =
  | { t: "hello"; protocol: number; companion: string }
  | { t: "selected-device"; name: string; path: string } | { t: "selected-device"; name: null }
  | { t: "device-tree"; path: string; tree: LiveDeviceNode }
  | { t: "live-values"; path: string; values: Record<number, number> }
  | { t: "saved"; path: string };

export type ToCompanion =
  | { t: "subscribe-values"; path: string; parameterIndices: number[] }
  | { t: "request-tree"; path: string }
  | { t: "save"; path: string; bytesBase64: string };
```

```typescript
// apps/site/src/companion/useCompanion.ts
export function useCompanion(): CompanionState {
  const [state, setState] = useState<Conn>({ kind: "absent" });

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;

    // One attempt on mount, then only on explicit user retry. Never poll:
    // a background reconnect loop against a port nothing is listening on
    // produces console noise on every page load for the majority of users
    // who will never install the companion.
    try {
      ws = new WebSocket(`ws://127.0.0.1:${BRIDGE_PORT}`);
      ws.onopen = () => !cancelled && setState({ kind: "connecting" });
      ws.onmessage = e => handle(JSON.parse(e.data), setState);
      ws.onerror = () => !cancelled && setState({ kind: "absent" });
      ws.onclose = () => !cancelled && setState({ kind: "absent" });
    } catch {
      setState({ kind: "absent" });
    }

    return () => { cancelled = true; ws?.close(); };
  }, []);

  return toPublicState(state);
}
```

Version negotiation matters here in a way it usually does not: the site auto-updates on every push, the device updates only when a user chooses to download a new one, so an old device will meet a new site routinely. On a `hello` with a mismatched `protocol`, the site should keep working in Tier 0 mode and show a quiet "companion needs updating" note, never an error.

**If loopback WebSocket is blocked**, fall back to a manual transfer, which needs no networking at all:

- The device's UI shows an **Export context** button, producing a JSON blob of the selected device's tree.
- The user copies it, or saves it, and drops it into the site.
- The site gets the same tree and the same filename suggestion. It loses only live value streaming, which is the least essential feature.

This fallback is worth building regardless, since it also covers users on locked-down corporate browsers.

**Do not** try to solve this with a local HTTPS server and a self-signed certificate. Certificate warnings on `localhost` are a worse experience than the manual export, and shipping a private key inside a downloadable device is not acceptable.

Do not point `jweb` at the deployed URL as the primary path. It trades a solved problem (bundling) for two unsolved ones: network availability inside Live, and version skew between an auto-updating site and an installed device.

---

## Phase 6: Reload (experimental)

Ableton's Browser API has real machinery here: browser items expose `is_loadable`, there is a `relation_to_hotswap_target` check and a hotswap-target-changed listener, and items load via `load_item`. This is the mechanism behind the yellow-border replace-in-place feature.

Two unknowns, both requiring a spike:

1. Can a script set the hotswap target itself, pointed at a chosen device, without the user initiating hotswap first?
2. Does `load_item` on a file just overwritten in place pick up the new bytes, or serve a cached version until the library rescans?

```typescript
async function onReload(savedPath: string) {
  const ok = await hotswap.loadFromBrowserItem(savedPath);
  if (!ok) showMessage("Drag the saved file from the browser onto the rack to reload it.");
}
```

Budget half a day. Ship the manual drag-back as the documented path regardless, since it always works and requires nothing from an undocumented API.

---

## Phase 7: Python control surface (optional)

Only needed for two cases: Surface A wanting live values (no Max patcher available to it), or watching parameters outside the current track. Not required for Surface B, Phase 5 covers that.

```python
# RackWatcher/RackWatcher.py
from _Framework.ControlSurface import ControlSurface

class RackWatcher(ControlSurface):
    def __init__(self, c_instance):
        super().__init__(c_instance)
        self._server = MinimalWebSocketServer(port=9700)
        self._server.start()
        self.schedule_message(1, self._tick)   # no threads available, cooperative only

    def _tick(self):
        for track in self.song().tracks:
            for device in track.devices:
                if not self._is_rack(device):
                    continue
                # Constraint 3: filter by name, do not assume parameters[i] is macro i.
                macros = [
                    {"index": i, "name": p.name, "value": p.value}
                    for i, p in enumerate(device.parameters)
                    if p.name.startswith("Macro")
                ]
                self._server.broadcast({"track": track.name, "rack": device.name, "macros": macros})
        self.schedule_message(1, self._tick)
```

Notes:

- Remote Scripts get no pip environment. Dependencies must be vendored in the script folder. A hand-rolled minimal WebSocket server (handshake plus text frames, no compression, no fragmentation) is realistically less work than vendoring a library correctly.
- Live's script host has no real threading. `schedule_message` is the only periodic mechanism.
- Poll visible racks rather than attaching listeners to everything, same scale reason as Phase 5.

### Bonus: empirical mapping discovery

For a rack with no saved file (built live, never exported), nudge a macro and watch which parameter's value moves in correlation. This discovers a binding without any file. It is invasive (the value audibly changes) and ambiguous when one macro drives several parameters, so use it as a cross-check or last resort, never as the primary path.

---

## Build order and risk

| Order | Phase | Blocks | Risk if skipped |
|---|---|---|---|
| 1 | Phase 1 schema investigation | everything | Silent file corruption |
| 2 | Phase 2 codec and tests | 3, 4, 5 | Same |
| 3 | Phase 3 editor UI | 4, 5 | None, straightforward React |
| 4 | Phase 4 site + Pages deploy | nothing | **Ships the product** |
| 5 | Phase 5 companion device (bundled) | nothing | Convenience only |
| 6 | Phase 6 reload | nothing | Manual drag always works |
| 7 | Phase 5.6 loopback bridge | nothing | Probably never needed |
| 8 | Phase 7 control surface | nothing | Optional entirely |

**Ship at step 4.** That is a deployed, useful, self-contained product with no Ableton API dependency, no install, and no backend. Steps 5 onward are enhancements for users who opt in, and each must be removable without touching the site.

### Open risks

1. **Schema unknowns (Phase 1).** Highest risk, and the reason Phase 1 is its own phase rather than folded into the codec.
2. **Variation permutation semantics (Constraint 4).** What Live puts in a vacated slot is empirical. Observe, then match.
3. **Asset paths in the bundled build (Phase 5.5).** The most likely device-side failure is a blank window from absolute paths resolving against the filesystem root. Build with `base: "./"` and test the installed `.amxd`, not just `pnpm dev`.
4. **Macro index to LOM parameter index (Constraint 3).** Resolve by name matching, verify against a drum rack specifically, where the layout is most likely to differ.
5. **Hotswap scriptability (Phase 6).** Undocumented even by Ableton. Ship the fallback.

### Do not

- Do not write `mutate.ts` before `SCHEMA.md` is complete.
- Do not compare `.adg` files byte for byte in tests. Gzip headers embed a timestamp.
- Do not let live LOM values influence what is written to the file. Bindings come from the file, values come from the LOM, and the boundary belongs in the code, not just in someone's head.
- Do not attach live listeners to a whole nested rack at once.
- Do not auto-load a guessed file path.
- Do not let the site import from the device package, or assume a companion is present anywhere in the editing path.
- Do not add a backend. The moment file bytes leave the browser, the privacy claim on the landing page stops being true.
- Do not point the device at the deployed URL. Bundle the build, as m4l-strudel does.
- Do not ship the service worker in the device build.
- Do not build the loopback bridge before someone actually asks for it.
