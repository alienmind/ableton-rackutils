# Developing ableton-rackutils

Everything needed to work ON the toolkit, as opposed to using it. For usage,
see the [README](../README.md).

## Docs

Everything needed to continue is in the repo.

| File | What it is |
|---|---|
| [`doc/PLAN.md`](PLAN.md) | Full implementation plan, phase by phase, with code. Opens with current state, next steps, and the constraints that rule out obvious designs. |
| [`packages/adg-codec/SCHEMA.md`](../packages/adg-codec/SCHEMA.md) | Schema findings, confirmed against real racks. The codec's spec. |
| [`doc/UI-PLAN.md`](UI-PLAN.md) | Web UI plan. Part 5 (match Live's visual language) is the governing principle; Parts 2-4 built, Part 1 on hold. |
| [`CLAUDE.md`](../CLAUDE.md) | House rules: commit style, comment style, where scratch work goes. |

## Repo layout

```
packages/adg-codec/   parse, mutate, serialize .adg. No UI deps.
packages/editor-ui/   shared React components. No Ableton deps.
apps/m4l-device/      optional companion .amxd, built with m4l-jweb.
apps/site/            the product. Static, deployed to GitHub Pages.
tools/adg-tool/       CLI: unpack/diff a rack, or exercise the codec directly.
```

Rules that keep the pieces honest:

- `adg-codec` must not import React, and must run identically in Node and the
  browser.
- `editor-ui` must not import anything `m4l-jweb`-specific. It takes live data
  as plain props, so it renders the same with or without the companion device.
- `apps/site` must never import from `apps/m4l-device`. The site has to build
  and deploy with the device removed entirely.
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

## Current state

Pre-alpha. The codec is built and tested, and the site now renders the macro
editor through `packages/editor-ui`. Nobody has loaded an edited file back
into Live from the UI yet, which is the test that matters. Full detail, and
what to do next, is in [`PLAN.md`](PLAN.md#current-state-and-next-steps).

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
pnpm test                                  # everything, 95 tests
pnpm --filter @rackutils/adg-codec test    # 78 codec tests
pnpm --filter @rackutils/editor-ui test    # 17 UI tests
```

`editor-ui` has two kinds of test and both are needed. `render.test.tsx`
checks what comes out of a render; `interact.test.tsx` mounts the tree and
fires real DOM events at it. The first cut of the UI shipped with every
interaction broken and every render test green - markup was never the
question.

### Neither of them runs in a browser, and that has cost real bugs

Both run under jsdom, which is not Chrome. Two bugs got through with a fully
green suite:

- **The XML declaration** (`SCHEMA.md` Q12). jsdom's `XMLSerializer` omits it,
  Chrome's includes it. The codec added one unconditionally, so in the real app
  every document had two, `Rack.clone()` threw on reparse, and every single
  edit failed silently. 89 tests passed throughout.
- **HTML5 drag-and-drop.** Worked in jsdom, did nothing in Chrome.

So when a change touches DOM serialization or pointer/drag behaviour, **drive
a real browser before believing the suite**. There is no browser test in the
repo yet - it was done ad hoc with Playwright against `pnpm dev`, loading a
real `.adg` through the file input and asserting on the DOM afterwards. Adding
that as a checked-in smoke test is worth doing; it is not done.

The general shape of the lesson: a test suite cannot falsify an assumption
about the environment it is itself running in.

Of the codec's 78, 60 are synthetic and always run; 18 run against real
Ableton-saved racks in
`packages/adg-codec/tests/fixtures/*.adg`, which are gitignored - they skip
cleanly when absent (so, in CI) and run locally once you drop the four files
`SCHEMA.md` asks for there. Four of `editor-ui`'s tests use those same
fixtures.

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
rejects outright, or one that loads happily and behaves wrong. Do it
especially on a rack with Macro Variations (`SCHEMA.md` Q6).

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

## The companion device

```bash
pnpm dev:device       # the device in a browser, with Live mocked beside it
pnpm build:device     # writes apps/m4l-device/dist/@rackutils/m4l-device/rack-editor.amxd
pnpm install:device   # copies it into Ableton's User Library
```

No Max install needed for the first two. It is a scaffold: the device confirms
the bridge is alive and nothing else. See `apps/m4l-device/README.md`.

## Pipeline

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | PR, push to main | lint, typecheck, codec tests |
| `deploy.yml` | push to main | codec tests, then build and deploy to Pages |
| `release-device.yml` | push to main | build `rack-editor.amxd`, publish to the `latest-device` release (overwritten each push, no versioning yet) |

Codec tests gate the deploy. A broken codec corrupts racks silently, which is
worse than the site being down. The site's "download companion device" button
reads `release-device.yml`'s output live via the GitHub API - see `PLAN.md`
Phase 4.5.

## Prior art

Earlier projects by the same author, heavily reused here.

- [`patchbay`](https://github.com/alienmind/patchbay) - Python DSL for
  authoring racks. Its `doc/SCHEMA.md` is the head start behind most of
  `SCHEMA.md`.
- [`m4l-jweb`](https://github.com/alienmind/m4l-jweb) - the framework the
  companion device is built on.
- [`m4l-strudel`](https://github.com/alienmind/m4l-strudel) - proves a full web
  app bundles offline into an `.amxd`.
- [`trackster`](https://github.com/alienmind/trackster) - the CI/CD, PWA, and
  File System Access patterns copied here, plus the SVG knob components
  `UI-PLAN.md` Part 1 starts from.
