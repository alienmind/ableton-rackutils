# macrowizard: kickoff

Continuation doc. The full plan lives in `doc/PLAN.md`. This is the short
version plus what to do next.

## What this is

A static website that loads an Ableton rack preset (`.adg`), shows its macros
and device tree, lets you drag a mapping from one macro knob to another, and
saves the modified file. Deployed to GitHub Pages. No backend, ever: the file
is parsed and rebuilt in the browser tab and never leaves the machine.

An optional Max for Live companion device ships the same UI bundled offline and
adds device targeting plus live macro values.

## Current state

Scaffolded only. Nothing is functional yet.

- `.github/workflows/` — CI, Pages deploy, device release. Adapted from
  `alienmind/trackster`.
- `packages/adg-codec/src/gzip.ts` — done, works.
- `packages/adg-codec/src/normalize.ts` — done, works.
- `packages/adg-codec/SCHEMA.md` — **empty template, this is the blocker.**
- `tools/adg-inspect/` — done, the tool for filling in SCHEMA.md.
- Everything else — not started.

## Do this next, in order

### 1. Fill in SCHEMA.md (blocks everything)

Nobody has Ableton's `.adg` schema memorized well enough to write mutation code
from memory. `SCHEMA.md` has nine questions and the diff procedure. Answer them
against three real racks before writing `parse.ts` or `mutate.ts`.

Read `alienmind/patchbay`'s `doc/ARCHITECTURE.md` and `doc/SCHEMA.md` first,
it documents much of this for Live 12.4.3. Then verify, don't assume.

### 2. Build the codec

`parse.ts`, `mutate.ts`, `model.ts`. Design decision already made: **keep the
parsed DOM as the source of truth.** A `Rack` class owns a mutable DOM and
exposes `clone()` for undo. Rebuilding XML from a pure data model would silently
drop everything the parser does not understand, and a rack contains a lot of
that.

### 3. Site, then device

Site first. It is the product and it de-risks everything else.

## Constraints that rule out obvious designs

1. **Mapping targets exist only in the file.** The LOM exposes a macro's
   current *value* but never which parameter it drives. Not via Max's LiveAPI,
   not via a Python Remote Script. So every remap is a file operation. There is
   no live API call for it.

2. **A live device has no pointer to its source file.** No `device.file_path`.
   The user must save the rack to disk and pick the file explicitly. A
   filename-based guess may be *suggested*, never auto-loaded.

3. **Macro index is not LOM parameter index.** `parameters[0]` is Device On,
   `[1]` is usually Chain Selector. Resolve by name, verify on a drum rack.

4. **Macro Variations are indexed by macro slot.** Moving a binding from macro
   2 to 3 without permuting every variation's value array silently breaks every
   variation in the rack. This is the easiest way to destroy someone's work.
   `moveMapping` and `swapMacros` must permute in lockstep, and there is a
   dedicated test for it.

5. **One macro per parameter.** Live enforces it, the file format does not.
   Rebinding must clear the previous owner.

6. **Macro count is 1..16, configurable.** Do not hardcode 8.

## Non-negotiables

- Do not write `mutate.ts` before `SCHEMA.md` is complete.
- Do not compare `.adg` files byte for byte in tests. Gzip embeds an MTIME
  header. Compare normalized XML.
- Do not add a backend. The privacy claim on the landing page must stay true.
- Do not let live LOM values influence what is written to the file.
- Do not point the device at the deployed URL. Bundle the build, as
  `m4l-strudel` does.
- Default to a read-only / simulated mode until the codec is proven, following
  trackster's precedent for a tool that rewrites user files in place.

## Prior art, all by the same author

- `alienmind/patchbay` — Python DSL for authoring racks. Has the schema work.
- `alienmind/m4l-jweb` — the framework the device is built on.
- `alienmind/m4l-strudel` — proves a full web app bundles offline into an
  `.amxd`.
- `alienmind/trackster` — the CI/CD and offline-first patterns copied here.
