# macrowizard

Rearrange Ableton rack macro mappings. Move the mapping on knob 2 over to knob
3, rebuild the `.adg`, reload it in Live.

**Status: scaffold. Not yet functional.** See [`KICKOFF.md`](KICKOFF.md) for
current state and next steps.

> **Data loss warning.** This tool rewrites rack preset files. Bugs can produce
> a file that loads in Live without complaint and behaves incorrectly, including
> silently breaking every Macro Variation in the rack. Keep backups. The tool
> defaults to read-only until the codec is proven.

## What it is

A static website. No backend, no account, no upload. The `.adg` is parsed,
edited, and rebuilt in the browser tab and never leaves your machine, because
there is no server for it to go to.

An optional Max for Live companion device bundles the same UI offline inside an
`.amxd` and adds device targeting plus live macro values.

## Why a file editor and not a live plugin

The Live Object Model exposes a macro's current *value*, but never which
parameter that macro drives. Not through Max's `LiveAPI`, not through a Python
Remote Script. So creating or moving a mapping is necessarily a file operation.
This constraint shapes the entire design. See `doc/PLAN.md` Part 2.

## Repo layout

```
packages/adg-codec/   parse, mutate, serialize .adg. No UI deps.
packages/editor-ui/   shared React components. No Ableton deps.
apps/site/            the product. Static, deployed to GitHub Pages.
apps/device/          optional companion .amxd, built with m4l-jweb.
tools/adg-inspect/    CLI for the schema investigation. Start here.
```

## Docs

Everything needed to continue is in the repo.

| File | What it is |
|---|---|
| [`KICKOFF.md`](KICKOFF.md) | Current state, next steps, the constraints that rule out obvious designs |
| [`doc/PLAN.md`](doc/PLAN.md) | Full implementation plan, phase by phase, with code |
| [`packages/adg-codec/SCHEMA.md`](packages/adg-codec/SCHEMA.md) | Empty schema log. **Blocks all codec work.** |

## Getting started

```bash
pnpm install

# Phase 1: establish the XML schema before writing any codec code.
pnpm adg-inspect unpack ~/path/to/rack.adg > rack.xml
pnpm adg-inspect diff before.adg after.adg
```

Then fill in `packages/adg-codec/SCHEMA.md`. Nothing else should be written
until it is complete: guessing element names produces silently corrupt files.

## Pipeline

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | PR, push to main | lint, typecheck, codec tests |
| `deploy.yml` | push to main | codec tests, then build and deploy to Pages |
| `release-device.yml` | `device-v*` tag | build embedded bundle and `.amxd`, publish as release asset |

Codec tests gate the deploy. A broken codec corrupts racks silently, which is
worse than the site being down.

## Prior art

All by the same author, all load-bearing here:

- [`patchbay`](https://github.com/alienmind/patchbay) — Python DSL for authoring
  racks. Its `doc/SCHEMA.md` is the head start for Phase 1.
- [`m4l-jweb`](https://github.com/alienmind/m4l-jweb) — the framework the
  companion device is built on.
- [`m4l-strudel`](https://github.com/alienmind/m4l-strudel) — proves a full web
  app bundles offline into an `.amxd`.
- [`trackster`](https://github.com/alienmind/trackster) — the CI/CD, PWA, and
  File System Access patterns copied here.

## License

TBD.
