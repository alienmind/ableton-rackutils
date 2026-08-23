# @rackutils/m4l-device

The optional companion Max for Live device for `ableton-rackutils`, built with
[M4L-JWEB](https://github.com/alienmind/m4l-jweb). See `doc/PLAN.md` Phase 5 in
the repo root for what this is for and what it still needs.

**Status: scaffold.** The bridge is alive (mode, build stamp, transport), the
device is a passthrough audio effect, nothing else is wired in yet. The
website (`apps/site`) is the product; this is a convenience for later.

```bash
pnpm install
pnpm dev              # the device in a browser, with a mocked Live beside it
pnpm build            # rack-editor.amxd - no Max installed
pnpm install:device   # into Ableton's User Library
```

Then in Live: **User Library > Max For Live > rack-editor**, and drop it on
any track. It is an audio effect with a passthrough chain, so it does not
change what plays.

## What you edit

| File | What it is |
|---|---|
| `src/app/rack-editor/App.tsx` | The UI, and the device's logic. A React app. |
| `src/app/rack-editor/protocol.ts` | Every selector crossing the bridge. Both sides read it. |
| `src/app/rack-editor/surface.ts` | The Live parameters (automatable, MIDI-mappable, visible to Push). Empty - this device has none. |
| `patcher/devices.mjs` | The manifest: name, type, chains. The patcher is generated from it. |

`src/app/shared/` and `scripts/` are infrastructure, shared boilerplate from
the `m4l-jweb init` template. You should rarely need to touch them.

## Developing without Live

`pnpm dev` renders a mocked Live next to the device: a transport (play/stop,
BPM) and a log of every message crossing the bridge. No Live, no Max needed
for UI work.

## Notes

Live embeds a **copy** of a device into the set, so reinstalling does not
update instances already on a track - delete them and re-drag from the
browser. The device prints a build stamp in its header, so a stale one is
visible.
