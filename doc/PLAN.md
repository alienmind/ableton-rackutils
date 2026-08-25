# ableton-rackutils: Implementation Plan (v5)

**Product status: v0.1.0, beta.** The editor works end to end and the round
trip through Live has been done on real racks. Still young: keep backups.

Canonical plan for `ableton-rackutils`, a Swiss-army toolkit for Ableton rack
preset (`.adg`) files. Lives in the repo so the project is self-contained:
clone it and everything needed to continue is here.

The first tool built on the toolkit is a macro mapping editor, and it is what
this plan describes end to end, because it proves out the codec, the app shell,
and the companion device pattern that later tools reuse. `adg-codec` and
`editor-ui` are structured so a second rack-editing tool is an additional
surface, not a rewrite.

Companion docs:
- `doc/DEVELOPERS.md` - setup, repo layout, how to test, the pipeline. The
  practical entry point; this document is the reasoning behind it. (`README.md`
  is for people using the tool, not building it.)
- `packages/adg-codec/SCHEMA.md` - the schema findings log, confirmed against
  real fixtures, that all codec code must trace to.
- `.github/workflows/` - CI, Pages deploy, device release.

Handoff document. Written so another agent can pick this up cold. Read Part 2
before writing any code: several intuitive designs are ruled out by facts about
Ableton's API that are not obvious.

What is already built is in the DONE section at the end, stated as outcomes.
Everything between here and there is work not yet done.

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

1. **Use it on real racks.** Every bug this project has hit came from that,
   not from tests - including a UI whose every interaction was broken while its
   whole suite passed (SCHEMA.md Q12).
2. **Confirm the colour index mapping** (Part 4.1). Everything colour-related
   rests on it.
3. **Finish the editor's open items** (Part 4.2).
4. **Device editor UI** (Part 4.5): `apps/m4l-device` should render the same
   `RackEditor`. The site is the product; the device is a convenience.

Default to a read-only or simulated mode for anything that writes over a user's
file. The site downloads a copy and never touches the original.

### The test that matters is not automated

Run a mutation, drag the result into Live, and look. Do it especially on a rack
with Macro Variations (SCHEMA.md Q6). Three real bugs so far were invisible to
the synthetic suite and one was invisible to the whole headless suite; see
`doc/DEVELOPERS.md` for what each one was. Two rules came out of them:

- Test against the real fixtures, not only synthetic ones. A synthetic fixture
  written from the codec's own assumptions agrees with the codec's own bugs.
- Run `pnpm test:e2e` whenever a change touches serialization, pointer
  handling, or layout. jsdom is not a browser.

---

## Part 1: What the user actually does

### The product in one sentence

Load a saved Ableton rack preset (`.adg`), see its macros and its device tree,
drag a mapping from one macro knob to another, save the modified file, reload
it in Live.

### The shape of the product

**A website, plus an optional download.**

The website is the product. It is a static site on GitHub Pages. No account, no
upload, no backend. The `.adg` is parsed, edited, and rebuilt entirely in the
browser tab, and never leaves the machine. That last point is worth saying out
loud on the landing page, because "drag your project files into a website"
otherwise sounds alarming, and here it happens to be literally true that
nothing is transmitted.

The companion device is a convenience, not a requirement. Everything the tool
does is possible without it, and it is not built yet.

This ordering drives the whole plan: the codec runs client-side because the
site has no server, and the device is built against a bridge that is allowed to
be absent.

### Tier 0: website only, nothing installed

The complete workflow, no download, no Ableton required at the time of editing:

1. In Live, save the rack to disk: click the disk icon in the rack's title bar,
   or drag the rack into the browser. This produces an `.adg` in the User
   Library. Required, see Constraint 2.
2. Open the site. Drag the `.adg` onto the page.
3. The rack renders the way Live draws it. Drag macro 2 onto macro 3 to move
   its mapping. Or drag a parameter onto a knob to bind it there.
4. Click **Save a copy**. The browser downloads the modified `.adg`.
5. In Live, drag the downloaded file from the browser onto the rack to reload
   it.

Works on a machine with no Ableton installed at all, and is the fallback
whenever anything in Tier 1 misbehaves.

### Tier 1: the companion device, editor included

Not built. No browser tab at all: the device carries the same editor and adds
what only Live can supply, knowing which rack is selected and what its
parameters are doing right now.

Install once:

1. On the site, click **Download companion device**. Gets `rack-editor.amxd`.
2. Drop it into the Ableton User Library, or drag it straight onto a track.
   Audio effect with a passthrough chain, so it does not alter the sound of the
   track it sits on.

Then, per session:

3. Click the rack in Live. The device shows its name, confirming the target,
   and can enumerate its live device tree, so parameters can be picked from
   what is actually loaded rather than from the file alone.
4. Save the rack to disk as in Tier 0 step 1. The device pre-fills the expected
   filename from the targeted device's name, as a suggestion to confirm, never
   an automatic load (Constraint 2).
5. Click **Open Editor**. A floating window appears, because the device view
   itself is only 169px tall and does not scroll. Same editor as the website.
6. Edit as in Tier 0. Macro knobs now show live positions alongside stored
   values.
7. Save. Writes straight back to the original path, no downloads folder.
8. Reload in Live by dragging, or try the experimental reload button (Part
   4.6).

### The device bundles the site, it does not fetch it

Worth stating up front because it collapses a lot of complexity: `m4l-jweb` can
ship a web app offline inside the `.amxd`, and m4l-strudel already proves this
at scale. That device runs the real `@strudel/core` engine headlessly inside a
MIDI device, explicitly with no browser tab, plus a sample browser that
downloads files next to the device. If a full live-coding engine and its sample
universe fit in an `.amxd`, an XML editor certainly does.

So the companion is not a thin remote that needs a live connection back to a
website. It contains the entire editor. Same build artifact, two delivery
targets:

- **GitHub Pages** serves it as a website.
- **The `.amxd`** bundles the same `dist/` and serves it from disk.

Consequences that shape everything downstream:

- No network dependency inside Live. Works on a plane, works airgapped.
- No online/offline fallback logic, no version skew between a hosted UI and an
  installed device, no CORS.
- The cross-process bridge (Part 4.8) becomes optional rather than central,
  since anyone who installs the device gets the full editor plus live data in
  one process.

### What this tool cannot do

- It cannot change mappings on a rack live, in place, while Live is running.
  Every edit goes through the file. Constraint 1 explains why.
- It cannot find the rack's file automatically, even with the companion
  installed. Constraint 2.
- It will not preserve mappings made after the rack was last saved to disk. The
  file is the source of truth.

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

Compounding it: a Max for Live device reaches its own device chain far more
readily than an arbitrary rack elsewhere in the set, and the rack the user
wants to edit is generally not the one hosting the editor.

Consequence: creating, moving, or deleting a binding is a file operation. There
is no live API call for it. Everything in this plan follows from that.

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
typically Chain Selector. Macros follow after that. The offset is not
guaranteed stable across rack types (drum racks and instrument racks differ).

Consequence: never assume `parameters[i]` is macro `i`. Build the mapping
empirically at runtime by matching parameter names, and verify against a real
rack before trusting it. Getting this wrong shows correct values on the wrong
knobs, a subtle and confusing bug.

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

### Verification status

Constraints 1 and 2 are well established. Constraints 4, 5 and 6 are confirmed
in the file format by SCHEMA.md Q5, Q1 and Q7. Constraint 3 is a LOM fact and
stays unverified until the device reads a real rack (SCHEMA.md Q9).

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
    m4l-device/         # optional companion .amxd, built with m4l-jweb
  tools/
    adg-tool/           # CLI for schema investigation and codec exercise
```

Rules that keep the tiers honest:

- `adg-codec` must not import React, and must run identically in Node (for
  tests) and browser.
- `editor-ui` must not import anything from `@m4l-jweb`. It receives live data
  as plain props, so it renders the same whether the companion is present or
  absent.
- `apps/site` must never import from `apps/m4l-device`. The site has to build
  and deploy with the device removed entirely.
- A `bridge-protocol` package of shared message types is only needed if Part
  4.8 is ever built. Types only, no runtime dependency on either side, so the
  two can be versioned independently.

The build must stay a pure static build. No server-side rendering, no API
routes, nothing that assumes a Node process at runtime.

---

## Part 4: Open work

### 4.1 Confirm the colour index mapping (SCHEMA.md Q13)

`MacroColor.N` and `DocumentColorIndex` are palette indices. Live's own 70
colours are sampled pixel-by-pixel from a screenshot of its picker by `pnpm
adg-palette` into `packages/editor-ui/src/livePalette.ts`.

**Unconfirmed:** whether a swatch's position in that grid is the number Live
stores. Grid order and stored index are two different things until a diff
proves otherwise. Colour three or four macros and chains distinctly by hand in
Live, save, and check which index landed where. Everything colour-related rests
on this.

### 4.2 Editor UI open items

- **Mapping table units.** Min and Max are shown as raw numbers. Live shows the
  target parameter's own units (`20.0 Hz`, `-inf dB`, `35.0 %`), which are not
  recoverable from the file for every parameter type. Sorting by column header
  is absent too.
- **Cables that persist on selection.** Clicking a macro or a parameter should
  show its existing patch cables, fading in and out rather than blinking. The
  machinery is in `PatchCable.tsx` and `useParamDrag.ts`; it currently draws
  only during a drag. Requested, not built.
- **The knob** is still a placeholder arc rather than a redrawn Live knob.
  Trackster's SVG knob components are the starting point.
- **Macro Variations render read-only.** Creating, recalling and deleting one
  need codec mutations that do not exist (4.3).
- **Drum pads** are laid out 4 wide, bottom-up, showing every pad. Live's
  16-pad scroll window is not reproduced because `PadScrollPosition`'s geometry
  is unconfirmed (SCHEMA.md Q10). Needs a diff of a scrolled pad view.
- **Absent entirely:** the chain selector strip, the Key/Vel/Chain zone editors,
  the Rand/Map buttons.

### 4.3 Codec work still open

- **Variation mutations.** Create, recall, delete. Constraint 4 applies to all
  three, and the vacated-slot semantics are already recorded in SCHEMA.md Q6.
- **Case transforms for names** (rack/macro/device names - CAPITALIZE,
  lowercase, CamelCase), applied automatically or on demand. The codec side is
  `renameMacro`/`renameRack` with a transform applied first; the open part is
  the UI surface to trigger it from.
- **Automatic colour choice**: from a palette, by name, or "sticky" colours for
  a given name or function that stay consistent across nested racks (every
  "Filter" macro anywhere in a rack tree gets the same colour). The sticky case
  needs a design decision first - a lookup table shipped with the tool, or user
  configurable, and scoped per rack or globally - before it is a codec
  function. Blocked on 4.1 either way.

### 4.4 Site work still open

Both of these are patterns trackster already solves; copy rather than rewrite.

**Offline (PWA).** `vite-plugin-pwa` with `registerType: 'autoUpdate'`, `scope`
and `start_url` from `VITE_BASE`, `maximumFileSizeToCacheInBytes` raised, and
`navigateFallbackDenylist: [/.*\.(adg|als|md|zip)$/i]` so the SPA fallback does
not swallow non-HTML assets. Someone mid-session with a DAW open should not be
blocked by a flaky connection.

Skip the plugin entirely in the device build. Bundling already solves offline
there, and a service worker only adds a caching layer that can serve stale UI
after a device update.

**File System Access API.** Better than the current download-a-copy flow.
`showOpenFilePicker()` returns a handle writable through `createWritable()`, so
the site can save the modified `.adg` over the original.

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

- Save-in-place moves from Tier 1 to Tier 0. The companion is then purely about
  targeting and live values.
- Reuse trackster's `src/types/file-system-access.d.ts`.
- Firefox and Safari support is weaker than Chromium's, so keep the `<input
  type="file">` plus download path as an automatic fallback, and detect rather
  than assume.
- Writing over the user's original file raises the stakes on Constraint 4.
  Default to read-only, and require an explicit opt-in before any destructive
  write.

**Pages gotchas not yet hit.** Add `.nojekyll` to the artifact root before any
file or folder starting with an underscore ships, or it is silently dropped. If
client-side routing is ever added, copy `index.html` to `404.html`, since Pages
has no rewrite rules; better, do not add routing, one page is enough.

### 4.5 The companion device

Nothing here blocks the product. The site already works. This makes targeting
and parameter-picking easier for people who install it, and every capability
below must degrade to absent without breaking the site. Until it does
something, the site advertises it as "Soon!" rather than offering a download
that would disappoint.

`m4l-jweb` is the author's own framework, so gaps here are build tasks rather
than blockers.

#### 4.5.1 Framework capabilities needed

**Native file picker inside `jweb`.** Only matters for the UI running inside
Live. Does `<input type="file">` open a real OS dialog, in both `pnpm dev` and
an installed `.amxd`? If it cannot be made to work, fall back to accepting a
typed path read via the Max side. Tier 0 is unaffected either way.

**Runtime-chosen parameter watching.** `defineWatch()` as documented appears
built for properties known at surface-definition time. Needed here: paths
chosen by the user mid-session.

```typescript
// One hook taking a list. Not one hook per parameter, hook count must not vary
// with array length.
function useLiveParameters(
  devicePath: LomPath | null,
  parameterIndices: number[],
): Record<number, number>;
```

Implementation: a generic `live.observer` pool on the Max side that attaches
and detaches by path at runtime, pushing changes over the existing bridge.

**Device tree enumeration.** A plain async function, not a hook, since it is
called on demand rather than subscribed to.

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

Its main job here is resolving Constraint 3: matching macro names from the file
against LOM parameter indices, so the live overlay lands on the right knobs.

**Selected-device tracking.**

```typescript
function useSelectedDevice(): { name: string; path: LomPath } | null;
```

Backed by `song.view.selected_track.view.selected_device`, which is observable.
The user clicks the device, which they were going to do anyway. An
enable/disable toggle trick was considered and rejected: it has a real side
effect (momentarily bypassing the device cuts held notes) and requires watching
every sibling. If a toggle fallback is still wanted, observe `parameters[0]`
(Device On), which is definitively a `DeviceParameter`, rather than
`is_active`.

#### 4.5.2 Device view

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

#### 4.5.3 Editor window

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

`guessPresetPath` globs the User Library for a filename match and returns a
suggestion for the load dialog. It never reads the file (Constraint 2). If the
rack was renamed or never saved, the suggestion is simply absent and the plain
file picker still works.

Render the live indicator as visually distinct from the stored value. They are
different things (Constraint 1: the file has bindings and stored values, the
LOM has current positions) and conflating them in the UI invites conflating
them in the code.

Attach live listeners only for currently visible macros, and detach on unmount.
A deeply nested rack has hundreds of parameters and eagerly watching all of
them will not end well.

#### 4.5.4 Bundling the site into the device

Build once, ship twice. The same `apps/site/dist` output is both the Pages
artifact and the device payload, copied into `patcher/web` by the device build.
Both build modes come from the single `VITE_BASE` env var the site config
already reads, so there is no separate device config to keep in sync.
`release-device.yml` passes `VITE_BASE: './'` and `VITE_EMBED: '1'`, then
asserts no absolute asset paths survived into the bundle. An absolute
`/ableton-rackutils/` path resolves against the filesystem root when loaded
from disk inside `jweb` and 404s into a blank window.

Checklist, most of which the site already satisfies because it was designed
backend-free:

- Relative asset paths.
- No absolute-root fetches, no CDN imports at runtime. Everything vendored at
  build time.
- Hide the landing copy, the download button, and any Pages-specific analytics
  when embedded. A build-time flag is cleaner than a URL parameter, since the
  bundle already differs.
- Skip the service worker (4.4).

Version the two together. The device reports the bundled site version in its
UI, so a bug report from inside Live is traceable to a commit.

Two open questions in `release-device.yml`, both marked in the file: whether the
`m4l-jweb` device build needs macOS and a Max toolchain (currently assumed, and
macOS runners bill roughly 10x Linux), and the exact output paths for the
`.amxd` and the embedded web directory.

### 4.6 Reload (experimental)

Ableton's Browser API has real machinery here: browser items expose
`is_loadable`, there is a `relation_to_hotswap_target` check and a
hotswap-target-changed listener, and items load via `load_item`. This is the
mechanism behind the yellow-border replace-in-place feature.

Two unknowns, both requiring a spike:

1. Can a script set the hotswap target itself, pointed at a chosen device,
   without the user initiating hotswap first?
2. Does `load_item` on a file just overwritten in place pick up the new bytes,
   or serve a cached version until the library rescans?

```typescript
async function onReload(savedPath: string) {
  const ok = await hotswap.loadFromBrowserItem(savedPath);
  if (!ok) showMessage("Drag the saved file from the browser onto the rack to reload it.");
}
```

Budget half a day. Ship the manual drag-back as the documented path regardless,
since it always works and requires nothing from an undocumented API.

### 4.7 Python control surface (optional)

Only needed for two cases: a browser tab wanting live values with no Max
patcher available to it, or watching parameters outside the current track. Not
required for the device, 4.5 covers that.

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

- Remote Scripts get no pip environment. Dependencies must be vendored in the
  script folder. A hand-rolled minimal WebSocket server (handshake plus text
  frames, no compression, no fragmentation) is realistically less work than
  vendoring a library correctly.
- Live's script host has no real threading. `schedule_message` is the only
  periodic mechanism.
- Poll visible racks rather than attaching listeners to everything, same scale
  reason as 4.5.

**Bonus: empirical mapping discovery.** For a rack with no saved file (built
live, never exported), nudge a macro and watch which parameter's value moves in
correlation. This discovers a binding without any file. It is invasive (the
value audibly changes) and ambiguous when one macro drives several parameters,
so use it as a cross-check or last resort, never as the primary path.

### 4.8 The loopback bridge (probably unnecessary)

Bundling removes the reason this existed. It is only worth building for one
narrow case: someone who has the device installed but prefers editing in a real
browser tab, wanting live values there. That is a small audience and a large
amount of machinery. Documented here so the tradeoff is on record rather than
rediscovered.

**The problem.** The site is served from `https://` on GitHub Pages. The
companion runs on the user's own machine. Browsers block mixed content, so an
HTTPS page normally cannot open an insecure connection.

**Why it may still work.** Browsers treat loopback (`127.0.0.1`, and
`localhost` where it resolves to loopback) as a potentially trustworthy origin,
which is what makes local-companion architectures viable at all. Support has
historically differed between engines, and the rules around local network
access have been tightening, so this needs verifying per browser rather than
assuming.

**Spike this before building anything else here.** Half a day: serve a trivial
page over HTTPS, run a local WebSocket server on `127.0.0.1`, try to connect
from the page in Chrome, Firefox and Safari on macOS and Windows, and record
the result including whether any permission prompt appears.

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

The site-side hook must attempt the connection once on mount, then only on
explicit user retry. Never poll: a background reconnect loop against a port
nothing is listening on produces console noise on every page load for the
majority of users who will never install the companion. It must also return a
valid disconnected stub when nothing is running, with no thrown errors and no
retry spinner blocking the UI. The overwhelmingly common case is no companion
at all, and that path has to feel like the intended one rather than a degraded
one.

Version negotiation matters here in a way it usually does not: the site
auto-updates on every push, the device updates only when a user chooses to
download a new one, so an old device will meet a new site routinely. On a
`hello` with a mismatched `protocol`, the site should keep working in Tier 0
mode and show a quiet "companion needs updating" note, never an error.

**If loopback WebSocket is blocked**, fall back to a manual transfer, which
needs no networking at all: the device's UI shows an **Export context** button
producing a JSON blob of the selected device's tree, the user copies or saves
it and drops it into the site, and the site gets the same tree and the same
filename suggestion. It loses only live value streaming, which is the least
essential feature. This fallback is worth building regardless, since it also
covers users on locked-down corporate browsers.

**Do not** try to solve this with a local HTTPS server and a self-signed
certificate. Certificate warnings on `localhost` are a worse experience than
the manual export, and shipping a private key inside a downloadable device is
not acceptable.

---

## Build order and risk

Steps 1 to 4 are done; see DONE. What remains, in order:

| Order | Work | Blocks | Risk if skipped |
|---|---|---|---|
| 5 | 4.1 colour index confirmation | 4.3 sticky colours | Wrong colours written to files |
| 6 | 4.2 remaining editor items | nothing | Feature gaps only |
| 7 | 4.4 offline + save-in-place | nothing | Current flow already works |
| 8 | 4.5 companion device (bundled) | nothing | Convenience only |
| 9 | 4.6 reload | nothing | Manual drag always works |
| 10 | 4.8 loopback bridge | nothing | Probably never needed |
| 11 | 4.7 control surface | nothing | Optional entirely |

The product already ships. Everything above is an enhancement for users who opt
in, and each must be removable without touching the site.

### Open risks

1. **Colour index order (4.1).** Unverified, and everything colour-related
   rests on it.
2. **Range inversion semantics (SCHEMA.md Q4).** The editor now writes
   inverted ranges, and the only direct evidence that Live honours `Min > Max`
   is patchbay's Live 12.4.3 note. Confirm with our own diff.
3. **Asset paths in the bundled build (4.5.4).** The most likely device-side
   failure is a blank window from absolute paths resolving against the
   filesystem root. Build with `base: "./"` and test the installed `.amxd`, not
   just `pnpm dev`.
4. **Macro index to LOM parameter index (Constraint 3).** Resolve by name
   matching, verify against a drum rack specifically, where the layout is most
   likely to differ.
5. **`PadScrollPosition` geometry (SCHEMA.md Q10).** Unconfirmed, so the drum
   pad view does not match Live's.
6. **Hotswap scriptability (4.6).** Undocumented even by Ableton. Ship the
   fallback.

### Do not

- Do not model anything in `adg-codec` that is not traceable to a diff recorded
  in `SCHEMA.md`. Guessing an element name or a colour index produces files
  that load in Live without complaint and silently corrupt.
- Do not compare `.adg` files byte for byte in tests. Gzip headers embed a
  timestamp. Compare normalized XML.
- Do not let live LOM values influence what is written to the file. Bindings
  come from the file, values come from the LOM, and the boundary belongs in the
  code, not just in someone's head.
- Do not attach live listeners to a whole nested rack at once.
- Do not auto-load a guessed file path.
- Do not let the site import from the device package, or assume a companion is
  present anywhere in the editing path.
- Do not claim the companion device works on the site while it is a scaffold.
- Do not add a backend. The moment file bytes leave the browser, the privacy
  claim on the landing page stops being true.
- Do not point the device at the deployed URL. Bundle the build, as m4l-strudel
  does.
- Do not ship the service worker in the device build.
- Do not build the loopback bridge before someone actually asks for it.
- Do not use HTML5 drag-and-drop for editor gestures. See DONE, D3.

---

## Prior art, all by the same author

- `alienmind/patchbay` - Python DSL for authoring racks. Its `doc/SCHEMA.md` is
  the head start behind most of ours.
- `alienmind/m4l-jweb` - the framework the device is built on.
- `alienmind/m4l-strudel` - proves a full web app bundles offline into an
  `.amxd`.
- `alienmind/trackster` - the CI/CD, PWA, and File System Access patterns
  copied here, plus the SVG knob components 4.2 starts from.

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
  the grid being `ceil(count / 2)` wide, and the +/- buttons step by TWO.
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

### D5. Shipping the companion from the site - DONE

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
user. The download itself stays hidden until the device does something (D4).

Once the codec's versioning matures enough for real `device-vX` releases to
make sense, revisit: either the site should prefer a real tagged release over
the rolling one, or the rolling-build concept should retire entirely.

This matches how m4l-strudel distributes: a zip of devices on GitHub Releases,
with a maxforlive.com listing pointing at it. Worth listing there too once
stable. Note that maxforlive lists a single device file, so if this ever grows
to multiple devices, ship a zip bundle rather than fighting the form.

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
