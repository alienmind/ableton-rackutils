# Developing ableton-rackutils

Everything needed to work ON the toolkit, as opposed to using it. For usage,
see the [README](../README.md).

## Docs

Everything needed to continue is in the repo.

| File | What it is |
|---|---|
| [`doc/PLAN.md`](PLAN.md) | The plan. Opens with what the tool is for, then current state, open work, and the constraints that rule out obvious designs. Finished work is in DONE at the end, dropped ideas in Parked. |
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

## Current state

v0.4.0, beta. The codec is built and tested, the site renders the editor
through `packages/editor-ui` with the rack features strip and the plugin strip
on top of it, and the device carries the same editor offline. Racks it edited -
and racks the contract authored - have been loaded back into Live and played,
the device has been installed and opened, and the plugin scan has resolved a
real plugin from a real VST3 folder.

Two things to know before changing anything: a drum rack's chain selector stops
selecting when it is applied alongside several other features (bisected, not
fixed), and the list of what has and has not been confirmed BY HAND is the
first thing to read in [`PLAN.md`](PLAN.md#confirmed-and-not). Full detail, and
what to do next, is in [`PLAN.md`](PLAN.md#current-state).

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
pnpm test                                  # everything headless, 249 tests
pnpm --filter @rackutils/adg-codec test    # 189 codec tests
pnpm --filter @rackutils/editor-ui test    # 60 UI tests
pnpm test:e2e                              # 49 browser specs, needs Chromium
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
or layout that must not overflow.

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

## Pipeline

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | PR, push to main | lint, typecheck, codec and UI tests, plus a `browser` job running the Playwright specs in Chromium |
| `deploy.yml` | push to main | codec tests, then build and deploy to Pages |
| `release-device.yml` | push to main, `v*` tag | build the device and its bundled site, guard the bundle, publish the zip - to the rolling `latest-device` prerelease on main, and to the tag's own release on a `v*` tag |

Codec tests gate the deploy. A broken codec corrupts racks silently, which is
worse than the site being down. The site's device download reads the releases
list live via the GitHub API and offers the newest `vX.Y.Z` carrying a device
zip - see `PLAN.md` D5 and D7.

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
