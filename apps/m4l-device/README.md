# @rackutils/m4l-device

The companion Max for Live device for `ableton-rackutils`, built with
[M4L-JWEB](https://github.com/alienmind/m4l-jweb). See `doc/PLAN.md` D7 in the
repo root for the reasoning.

**It adds no editing capability.** It is the same web app the site serves,
bundled, so the editor is reachable inside Live with no browser and no network.
Anyone who has the site has everything this does; what it adds is reach.

```bash
pnpm install
pnpm dev              # the device in a browser, with a mocked Live beside it
pnpm build            # the .amxd, its site folder, and the release zip
pnpm install:device   # into Ableton's User Library
```

Then in Live: **User Library > Max For Live > rack-editor**, drop it on any
track, and press **Open**. It is an audio effect with a passthrough chain, so
it does not change what plays.

## What the build produces

`pnpm build` runs the SITE's build first (`VITE_BASE=./ VITE_EMBED=1`), copies
it into `site/`, and packages:

```
dist/@rackutils/m4l-device/rack-editor.amxd
dist/@rackutils/m4l-device/rack-editor-site/editor/   <- the web app
dist/@rackutils/m4l-device.zip                        <- what gets released
```

**The folder is not optional.** Every other m4l-jweb window rides inside the
wrapper as base64; a whole site is too big for that, so it travels beside the
device. Without it the window opens empty. Install the zip whole, or use
`install-mac.sh` / `install-windows.ps1` from it.

On macOS, anything downloaded carries a quarantine flag. The installer clears
it; by hand it is `xattr -dr com.apple.quarantine` on the unpacked folder.

## Two guards, and why they fail the build

```bash
pnpm check:site
```

- **No absolute asset paths.** Inside `jweb` the page is a `file://` URL, so
  `/ableton-rackutils/assets/index.js` resolves against the FILESYSTEM root and
  404s into a blank window. It is the top device-side failure mode and it is
  invisible in a browser, where the same path works.
- **No service worker.** Bundling already solves offline; a worker here only
  adds a layer that can serve a stale UI after a device update.

## What you edit

| File | What it is |
|---|---|
| `src/app/rack-editor/App.tsx` | The device view: an Open button, and the build stamps. |
| `src/app/rack-editor/surface.ts` | The window, and its content - `site: "site"`. No Live parameters: this is a tool. |
| `src/app/rack-editor/protocol.ts` | Every selector crossing the bridge. Both sides read it. |
| `scripts/bundle-site.mjs` | Builds `apps/site` for the device and copies it into `site/`. |
| `scripts/check-site-bundle.mjs` | The two guards above. |
| `patcher/devices.mjs` | The manifest: name, type, chains. The patcher is generated from it. |

`src/app/shared/` is infrastructure from the `m4l-jweb init` template.

## What it deliberately does not do

**It does not list the racks on this track.** LOM can enumerate their names and
nothing else: it cannot read their mappings (Constraint 1) and cannot find
their files (Constraint 2). A list of names would be a file picker wearing a
costume, and the rack has to be saved out of Live either way.

## Notes

Live embeds a **copy** of a device into the set, so reinstalling does not
update instances already on a track - delete them and re-drag from the
browser. The device prints a build stamp in its header, so a stale one is
visible.
