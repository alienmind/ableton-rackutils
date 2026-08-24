# Developing ableton-rackutils

Everything needed to work ON the toolkit, as opposed to using it. For usage,
see the [README](../README.md).

## Docs

Everything needed to continue is in the repo.

| File | What it is |
|---|---|
| [`doc/PLAN.md`](PLAN.md) | Full implementation plan, phase by phase, with code. Opens with current state, next steps, and the constraints that rule out obvious designs. |
| [`packages/adg-codec/SCHEMA.md`](../packages/adg-codec/SCHEMA.md) | Schema findings, confirmed against real racks. The codec's spec. |
| [`doc/UI-PLAN.md`](UI-PLAN.md) | Web UI overhaul plan (Ableton-matching macro panel). Part 4 built, the rest planning. |
| [`CLAUDE.md`](../CLAUDE.md) | House rules: commit style, comment style, where scratch work goes. |

## Repo layout

```
packages/adg-codec/   parse, mutate, serialize .adg. No UI deps.
packages/editor-ui/   shared React components. No Ableton deps. Not built yet.
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

## Current state

Pre-alpha. The codec is built and tested; the site still shows a raw XML tree
and is not wired to it. Full detail, and what to do next, is in
[`PLAN.md`](PLAN.md#current-state-and-next-steps).

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
pnpm --filter @rackutils/adg-codec test    # 61 tests
```

51 are synthetic and always run. 10 run against real Ableton-saved racks in
`packages/adg-codec/tests/fixtures/*.adg`, which are gitignored - they skip
cleanly when absent (so, in CI) and run locally once you drop the three files
`SCHEMA.md` asks for there.

**Test every mutation against the real fixtures, not only synthetic ones.**
Two real bugs so far were invisible to the synthetic suite: a macro driving
several parameters at once had only one target moved, and the output file
would not load in Live at all because `XMLSerializer` omits the XML prolog.
Both were found by using the tool on an actual rack.

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
