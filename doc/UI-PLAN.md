# ableton-rackutils: Web UI Overhaul Plan

Companion to `doc/PLAN.md` - that document covers the codec (done, Phase 2)
and the product shape; this one covers replacing `apps/site`'s current raw
XML tree viewer with a UI that looks and behaves like Ableton's own rack
macro panel, built on the same components the embedded M4L device UI reuses
later (Phase 5.4 in `PLAN.md`).

**Status: Part 4 built, the rest is still planning.** All five new mutations
exist in `packages/adg-codec/src/mutate.ts` and are tested against the real
fixtures. Parts 1, 2 and 3 are unimplemented. Do not start on the
reference-image work (Part 1) until explicitly asked - that instruction came
directly from the project owner and still holds until someone says otherwise.

---

## Part 0: What exists already, what this plan adds

The codec (`packages/adg-codec`) is built and tested (`doc/PLAN.md`
"Current state and next steps", `SCHEMA.md`). It already exposes everything
a UI needs to read:

```typescript
rack.name                    // string, editable target (see Part 4)
rack.macroCount              // 1..16, editable via a new mutation (Part 3)
rack.macros                  // Macro[], see below
rack.chains                  // Chain[] -> DeviceNode[] (recursive, nested racks included)
rack.variations               // Variation[]

interface Macro {
  index: number;
  name: string;
  color: number;              // MacroColor.N, a PALETTE INDEX, not RGB - see Part 1.3
  value: number;
  bindings: Binding[];        // 0, 1, or many - a macro can drive several parameters at once
}

interface DeviceNode {
  path: string;
  type: string;
  name: string;
  isRack: boolean;
  chains: Chain[];             // recursion for nested racks
  parameters: ParamRef[];      // { path, name, boundToMacro: number | null }
}
```

And these mutations, all tested against real racks (`packages/adg-codec/src/mutate.ts`):

```typescript
moveMapping(rack, from, to)              // relocate ALL of a macro's bindings
swapMacros(rack, a, b)                   // exchange bindings, name, color, value, variations
bindParameter(rack, macroIndex, target)  // adds a target, does not clear the macro's others
unbindMacro(rack, macroIndex)            // clears ALL of a macro's bindings
renameMacro(rack, macroIndex, name)
```

`apps/site/src/App.tsx` currently does none of this - it decompresses a
`.adg`, parses it with a bare `DOMParser`, and renders `RackTree.tsx`, a
generic collapsible XML dump (`apps/site/src/RackTree.tsx`). That component
is superseded by this plan, not extended - the new UI is schema-aware
(reads `Rack.macros`/`.chains`), the old one deliberately wasn't.

What this plan adds, in four parts:

1. **Part 1** - extract Ableton's own macro-panel visual language from a
   reference screenshot into reusable SVG assets. Not started yet.
2. **Part 2** - the interaction and data-flow spec: what drag-reorder,
   double-click-rename, arm-and-bind, and the mapped/"more" split actually
   do, in terms of the mutations above (plus a couple of new ones).
3. **Part 3** - the React component tree, file by file, with skeletons.
4. **Part 4** - new `adg-codec` mutations this UI needs that don't exist yet
   (macro count, reorder, chain rename, macro color).

---

## Part 1: Reference images and SVG extraction (NOT STARTED - do this first when told to)

The project owner dropped two reference images, both gitignored and local
only (neither is present in a fresh clone, neither is committed):

- `tmp/rack-example.png` - a screenshot of a real Ableton rack, covering the
  macro panel, title bar, and chain UI (Part 1.1).
- `tmp/ableton-colors.png` - the macro color palette grid, covering the
  color-index problem (Part 1.3).

**Nobody has looked at either one yet.** This section is the brief for
whoever does.

### 1.1 What to extract

Only the elements a user can actually act on through this tool - not the
inner device chrome (an Operator's oscillator waveform selector, a
Saturator's drive curve, etc. are irrelevant; this tool never touches them).
Concretely, from the screenshot, identify and vectorize:

1. **The macro knob.** Ableton's rack macro knob: a circular dial with an
   arc indicator (~270° sweep, matching the code sketch already in
   `PLAN.md` Phase 3.3 - `style={{ "--angle": ... }}`), a colored ring or
   fill (see 1.3), the macro's name below or above it, and its stored value
   position. Capture it at rest, and note whether Ableton shows a distinct
   "unmapped" visual state (greyed out, dashed ring, etc.) - that matters
   for Part 2's mapped/unmapped distinction.
2. **The rack title bar.** Rack name text, and whatever chrome surrounds it
   (the disk/save icon, the on/off toggle, the macro variations
   controls if visible in the screenshot). Only the name needs to become
   editable (Part 2.2); note the rest for visual fidelity even if this tool
   doesn't wire them up.
3. **The macro count +/- control.** Ableton's actual UI for showing more or
   fewer macro knobs (in Live 12 this is a small button, not literally
   "+/-" - check the screenshot for the real affordance and name it
   accurately rather than assuming).
4. **Chain selector / chain names**, if visible in the screenshot. Rack
   chains have names and a chain-selector strip; capture how Ableton draws
   the currently-selected chain vs others.
5. **Nesting chrome.** How Ableton visually indicates "this is a rack inside
   a rack" - indentation, a border, a distinct header style. This is what
   Part 3's `NestedRackPanel` needs to match.

### 1.2 How to extract it

**Check for a reusable asset first, before drawing anything new.**
`alienmind/trackster` (a sibling project, freely reusable - explicit
permission from the project owner) already has hardware-style knob
components worth starting from:

- `trackster/src/components/Core/HardwareUI/Knob.tsx` - a full SVG rotary
  knob (radial-gradient cap, rim, an LED indicator, 4 color variants) as a
  React component, not a static asset - copy the component, not just the
  markup.
- `trackster/src/hooks/useKnobInteraction.ts` - vertical-drag-to-rotate
  pointer handling, `-135..+135` degree range (the exact same convention
  this plan's own `MacroKnob` sketch in Part 3.2 already uses), with a
  documented anti-render-storm pattern (refs refreshed via
  `useLayoutEffect` so window-level `pointermove`/`pointerup` listeners are
  attached once per drag, not re-registered every render). Directly
  reusable if this UI ever wants click-drag-to-set-value on a knob (not in
  the current interaction spec, Part 2, but a natural extension).
- `trackster/src/components/devices/` (MiniFreak, Circuit Tracks, Grind, S1)
  - several complete hardware-panel UIs built from the same primitives, worth
    a look for chain-strip / button chrome ideas beyond just the knob.

**The honest gap:** trackster's `Knob` renders a physical potentiometer
look - a rotating indicator LINE on a knob cap, meant to mimic a real
hardware dial. Ableton's own macro knob (confirmed from the reference
screenshot once Part 1.1 happens, but true of Ableton's UI in general) uses
an ARC-fill sweep instead - a value shown as how much of a ring is filled
in, not a rotated line. So trackster's component is a strong **base for the
physical shell** (the gradient cap, the rim, the sizing, the color-variant
system) but the value-indicator itself still needs the arc approach already
in Part 3.2's `arcPath` sketch, layered on top or swapped in. Don't force a
line-indicator knob into this UI just because it's already built - match
Ableton's actual visual language (that's the whole point of Part 1), reuse
trackster for everything that doesn't conflict with that goal.

Once existing-asset reuse is exhausted, for whatever's left the source is a
PNG screenshot, not a vector original, so "extraction" means **redrawing**
each element as clean SVG that matches the screenshot closely (shapes,
proportions, relative colors) - not literally tracing pixels. Two viable
approaches, pick per element based on complexity:

- **Hand-authored SVG** for simple geometric shapes (an arc `<path>` + a few
  text elements) - most of what's left after reusing trackster's knob shell
  is this simple. See the worked example in Part 3.2.
- **Traced/simplified SVG** (via an image trace, then manually cleaned up)
  only if something is genuinely irregular (an icon glyph, a logo). Prefer
  redrawing over tracing wherever the shape is describable geometrically -
  traced paths from a raster source are usually messier and harder to
  theme (see 1.3) than a hand-built equivalent.

Load the `artifact-diagramming` skill before drawing anything - it has the
inline-SVG mechanics (viewBox conventions, how to keep strokes crisp,
light/dark theme patterns) this project should follow, since these SVGs
need to work in both the site's dark theme (see `apps/site/src/styles.css`
for the current palette) and whatever theme the M4L-embedded copy ends up
using.

### 1.3 The color palette problem

`Macro.color` (from `MacroColor.N`) is confirmed by `SCHEMA.md` §6/Q7 to be
an **integer palette index**, not an RGB value. Ableton's macro color picker
offers a fixed palette (a grid of swatches, roughly 60-70 colors in recent
Live versions). To render a knob in its actual color, this project needs an
`index -> hex` lookup table that does not exist yet.

**A second reference image now covers most of this:** `tmp/ableton-colors.png`
(gitignored, local only, same hold as `tmp/rack-example.png` - not processed
yet). It's the full color palette grid as Ableton's own picker shows it, so
the hex values can likely be read directly from it (color-pick each swatch)
rather than needing a live Ableton session just for color - **the position
in this image still is not guaranteed to be the stored `MacroColor.N` index**
(grid position and stored index are two different things - the sentence
below about verifying with a diff is not optional just because a picture of
the grid exists now). Use the image for the hex values, still confirm the
index mapping against a real rack with known colors set by hand.

Check `alienmind/patchbay`'s docs first (`doc/ARCHITECTURE.md`/`SCHEMA.md`
there) in case the index mapping is already documented - it covers
`MacroColor.N` as a known field but the palette values were not confirmed on
our side yet.

Store the result as a plain TypeScript const, e.g.
`packages/editor-ui/src/macroColors.ts`:

```typescript
// Index -> hex, Live's macro color palette. Position N here must match
// what Live writes to MacroColor.N exactly - verify against a rack with
// several different macro colors set by hand, not assumed from the picker
// grid's visual order alone (grid position and stored index are not
// guaranteed to be the same. Confirm with a diff, same discipline as SCHEMA.md).
export const MACRO_PALETTE: readonly string[] = [
  '#...', // 0
  // ...
];
```

**This needs its own SCHEMA.md-style confirmation** (a rack with 3-4 macros
set to known colors by hand, diffed) before it's trusted - guessing palette
positions produces a UI that shows the wrong color confidently, which is a
quieter but real version of the "worst failure mode" `SCHEMA.md` already
warns about for file corruption.

### 1.4 Deliverables from Part 1

- `packages/editor-ui/src/icons/` (or similar): one `.tsx` per visual
  element as an inline SVG React component (`MacroKnobSvg`, `RackHeaderSvg`
  chrome pieces, etc.), not raw `.svg` files imported as assets - inline
  keeps them themeable via CSS custom properties, per `artifact-diagramming`
  conventions.
- `packages/editor-ui/src/macroColors.ts`, the confirmed palette table.
- A short write-up (append to this file, a new Part 1.5, or a
  `packages/editor-ui/VISUAL-NOTES.md`) of what was matched vs
  approximated, so the next person knows what's confirmed-accurate vs
  eyeballed.

---

## Part 2: Interaction and data-flow spec

Every interaction below is described as: the gesture, what UI state it
implies, and the exact `adg-codec` call it makes. This is the contract Part
3's components implement against.

### 2.1 Reordering macros (drag and drop)

**Gesture:** drag a macro knob and drop it on a different position in the
bank.

**This is a true reorder (shift), not a swap.** Dropping macro 5 onto
position 2 should push 2,3,4 down to 3,4,5 - not swap 2 and 5 and leave
3,4 untouched. That's a different operation from `swapMacros`, which
exchanges exactly two slots. `PLAN.md`'s original sketch (`MacroSlot`,
Phase 3.3) conflated "drag to move" with `moveMapping` (which only relocates
bindings, not name/color/value) - keep that distinction precise here:
dragging in this UI reorders the WHOLE macro (name, color, value, bindings,
variations), which needs a new mutation, `reorderMacro` - see Part 4.1.

Hold a modifier while dropping (PLAN.md's original suggestion) to get a true
two-way `swapMacros` instead, for users who want that specifically. Label
both affordances in the UI since the difference is easy to get wrong.

### 2.2 Renaming (double-click)

**Gesture:** double-click a macro knob's label, OR the rack title bar.

**State:** an inline text input replaces the label in place (not a modal -
matches Live's own inline-rename UX for macros and track names).

**Commit:** on blur or Enter, call `renameMacro(rack, index, newName)` for
a macro, or a new `renameRack`/similar for the title bar (Part 4.3). Escape
cancels without mutating.

### 2.3 Recoloring (double-click, or a dedicated swatch click)

**Gesture:** clicking a small color swatch on the knob (separate from the
name double-click, so the two don't fight over the same gesture) opens a
palette popover built from `MACRO_PALETTE` (Part 1.3).

**Commit:** picking a swatch calls a new `setMacroColor(rack, index, colorIndex)`
mutation (Part 4.4).

### 2.4 Macro count (+/- control)

**Gesture:** click the +/- control identified in Part 1.1.3.

**Commit:** `setMacroCount(rack, newCount)` (Part 4.2), bounded 1..16.
Shrinking the count does NOT delete bindings on now-hidden macro slots -
per `SCHEMA.md` Q7, all 16 slots persist in the file regardless of visible
count, matching Ableton's own behavior (confirmed: toggling visible count
in Live changes only `NumVisibleMacroControls`, nothing else). The UI
should say as much if a user shrinks past a mapped macro ("macro 6 is still
mapped, just hidden - increase the count to see it again"), not silently
hide a live mapping with no explanation.

### 2.5 Arming and binding (mapped vs "more")

This is the core editing loop, and it replaces `RackTree`'s flat parameter
list entirely.

**Per device row** (leaf device or nested rack, from `DeviceNode.parameters`):

- Partition `parameters` into **mapped** (`boundToMacro !== null`) and
  **unmapped**.
- Render mapped parameters as visible rows immediately under the device
  name, each showing its name and which macro badge it's under (`M3`,
  etc.) - this is the "expose the features currently connected to an
  external knob by name" requirement.
- Render unmapped parameters collapsed under a **"more"** row/toggle.
  Expanding it lists every unmapped parameter on that device.

**Gesture: pick a target.** Clicking an unmapped parameter in the expanded
"more" list arms it (visually marked as armed, matches the existing
`armed`/`onArm` pattern already sketched in `PLAN.md` Phase 3.1/3.2).
Clicking a macro knob while something is armed calls
`bindParameter(rack, macroIndex, armedParam)`.

**The promotion.** Immediately after a successful bind, that parameter's
`boundToMacro` is no longer null (the next `rack.chains` read reflects it,
since the model recomputes from the DOM on access - `PLAN.md` Phase 2.1's
design already gives this for free). The component re-renders that
parameter into the mapped row and out of "more" **without a page reload or
manual list surgery** - it falls out of the render naturally because mapped
vs unmapped is computed from live data on every render, not tracked as
separate component state. This is the single most important architectural
point in Part 3: **do not maintain a separate "mapped list" in React
state that has to be kept in sync by hand** - derive it from
`rack.chains` every render, exactly as `RackEditor`'s `apply()` pattern in
`PLAN.md` Phase 3.1 already does for the macro bank.

**Unbinding.** A small "x" or similar on a mapped row calls
`unbindMacro`... wait - `unbindMacro` clears ALL of a macro's bindings
(Part 0), which is wrong here if a macro drives several parameters (a real,
confirmed case - `SCHEMA.md`, the multi-target bugfix). This interaction
needs a **per-binding unbind**, not per-macro. `unbindMacro` as it exists
today is the wrong primitive for this gesture - Part 4.5 specs the
narrower one this needs.

### 2.6 Nested racks

A `DeviceNode` with `isRack: true` renders as a **collapsed-by-default**
panel (matches `PLAN.md` Phase 3.2's existing rationale: a drum rack with
many nested engine racks expands to thousands of rows) containing its own
full macro bank + chain list, recursively - the same top-level components
Part 3 defines, called on the nested `DeviceNode.chains` instead of the
root `rack.chains`. Macro-to-macro bindings (an outer macro driving a
nested rack's own macro, confirmed real in `SCHEMA.md` Q2/Q8 and in the
user's own Drum Rack) show up as an ordinary mapped-parameter row on the
nested rack's `MacroControls.N`, named whatever `ParamRef.name` resolves to
for that element (today, the raw tag name `MacroControls.N` if it has no
`<Name>` child - worth a small display-name special case, "Macro N of
[nested rack name]", rather than showing the raw tag).

---

## Part 3: Component tree

### 3.0 Where this code lives

**Resurrect `packages/editor-ui`** as a real shared package (`PLAN.md`'s
repo layout always planned for it; the "fold into `apps/site`" note in
`PLAN.md`'s current-state section was written before device-UI reuse was a
confirmed near-term requirement - it is now, per this conversation). Rule
from `PLAN.md` Part 3 still applies: `editor-ui` imports nothing
`@m4l-jweb`-specific, so it renders identically whether `apps/site` or
`apps/m4l-device` hosts it.

```
packages/editor-ui/
  src/
    RackEditor.tsx        # top-level container, owns undo stack (Part 3.1)
    RackHeader.tsx         # editable name, +/- macro count (Part 3.3)
    MacroBank.tsx           # the knob grid, drag-and-drop host (Part 3.4)
    MacroKnob.tsx            # one knob: SVG + label + color swatch (Part 3.5)
    ColorPicker.tsx          # palette popover (Part 3.6)
    ChainPanel.tsx            # one chain: name, device list (Part 3.7)
    DeviceRow.tsx               # one device: mapped rows + "more" (Part 3.8)
    NestedRackPanel.tsx           # isRack devices, recurses into RackEditor's guts (Part 3.9)
    icons/                          # Part 1.4 output
    macroColors.ts                   # Part 1.3 output
    editor.css                        # shared styles, themeable
  package.json
```

`apps/site` and `apps/m4l-device` both depend on `@rackutils/editor-ui`
(workspace protocol, same pattern `apps/m4l-device` already uses for
`@m4l-jweb/*`). Neither reimplements any of this.

### 3.1 `RackEditor.tsx` - top-level container

Close to `PLAN.md` Phase 3.1's sketch, updated for the corrected mutation
set (Part 0) and the new ones (Part 4):

```tsx
export interface RackEditorProps {
  onSave: (bytes: Uint8Array, suggestedName: string) => void | Promise<void>;
  liveValues?: Record<number, number>;   // Surface B only, M4L device - display only
  suggestion?: { path: string; label: string };
}

export function RackEditor({ onSave, liveValues, suggestion }: RackEditorProps) {
  const [rack, setRack] = useState<Rack | null>(null);
  const [undo, setUndo] = useState<Rack[]>([]);
  const [armed, setArmed] = useState<ParamRef | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Every mutation goes through here - undo and warnings can never be
  // forgotten in a new interaction, and every read (macros, chains,
  // variations) is derived fresh from `rack` on each render (Part 2.5).
  const apply = useCallback(
    (fn: (r: Rack) => MutationResult) => {
      if (!rack) return;
      setUndo((u) => [...u.slice(-49), rack.clone()]);
      const result = fn(rack);
      setWarnings(result.warnings);
      setRack(rack.clone()); // new reference so React re-renders; rack itself was mutated in place
    },
    [rack],
  );

  return (
    <div className="rack-editor">
      <Toolbar
        onLoad={(bytes) => {
          setRack(Rack.parse(bytes));
          setUndo([]);
        }}
        onSave={() => rack && onSave(rack.serialize(), `${rack.name}.adg`)}
        onUndo={() => {
          const prev = undo.at(-1);
          if (prev) {
            setRack(prev);
            setUndo((u) => u.slice(0, -1));
          }
        }}
        canUndo={undo.length > 0}
        suggestion={suggestion}
      />
      {warnings.length > 0 && <WarningBar warnings={warnings} />}
      {rack && (
        <RackHeader
          rack={rack}
          onRename={(name) => apply((r) => renameRack(r, name))}
          onSetMacroCount={(count) => apply((r) => setMacroCount(r, count))}
        />
      )}
      {rack && (
        <div className="rack-editor-body">
          <MacroBank
            macros={rack.macros}
            liveValues={liveValues}
            armed={armed}
            onReorder={(from, to) => apply((r) => reorderMacro(r, from, to))}
            onSwap={(a, b) => apply((r) => swapMacros(r, a, b))}
            onBindArmed={(i) => {
              if (armed) {
                apply((r) => bindParameter(r, i, armed));
                setArmed(null);
              }
            }}
            onUnbindOne={(macroIndex, targetPath) => apply((r) => unbindOne(r, macroIndex, targetPath))}
            onRename={(i, name) => apply((r) => renameMacro(r, i, name))}
            onRecolor={(i, colorIndex) => apply((r) => setMacroColor(r, i, colorIndex))}
          />
          <ChainList chains={rack.chains} armed={armed} onArm={setArmed} />
        </div>
      )}
    </div>
  );
}
```

Note `onSave`'s default-to-read-only caveat from `PLAN.md`'s own rule still
applies at the call site (`apps/site/src/App.tsx`), not inside this
component.

### 3.2 `MacroKnob.tsx` - the SVG knob (worked example)

This is the one component Part 1's extraction most directly feeds. A
reasonable starting shape, to be corrected against the actual screenshot
once Part 1 happens - **do not treat these exact numbers as final**, they
are a plausible placeholder so the rest of the plan has something concrete
to reference. Per Part 1.2, build the knob's physical shell from
`trackster/src/components/Core/HardwareUI/Knob.tsx` rather than from
scratch (its gradient cap/rim/sizing), replacing only its rotating-line
value indicator with the arc-fill sweep below to match Ableton's actual
look:

```tsx
interface MacroKnobProps {
  macro: Macro;               // from adg-codec
  liveValue?: number;         // M4L device only
  armed: boolean;             // something is armed and this knob is a valid drop target
  draggable: boolean;
  onDragStart: () => void;
  onDrop: (fromIndex: number) => void;
  onClick: () => void;        // bind-armed-parameter gesture
  onRename: (name: string) => void;
  onRecolor: (colorIndex: number) => void;
}

export function MacroKnob({ macro, liveValue, armed, draggable, onDragStart, onDrop, onClick, onRename, onRecolor }: MacroKnobProps) {
  const [editing, setEditing] = useState(false);
  const [pickingColor, setPickingColor] = useState(false);
  const angle = (macro.value / 127) * 270 - 135; // -135..+135, matches PLAN.md's original sketch
  const mapped = macro.bindings.length > 0;
  const color = MACRO_PALETTE[macro.color] ?? 'var(--macro-color-default)';

  return (
    <div
      className={`macro-knob${mapped ? ' mapped' : ' unmapped'}${armed ? ' drop-target' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(Number(e.dataTransfer.getData('text/macro-index')))}
      onClick={onClick}
    >
      <svg viewBox="0 0 64 64" className="macro-knob-svg">
        {/* Track: the full 270-degree sweep, dim */}
        <path d={arcPath(32, 32, 26, -135, 135)} className="knob-track" />
        {/* Fill: 0 to current value, in the macro's color */}
        <path d={arcPath(32, 32, 26, -135, angle)} style={{ stroke: color }} className="knob-fill" />
        {/* Live indicator (M4L device only), visually distinct per PLAN.md Phase 3.3's own rule -
            file value and live LOM value are different things and must never look the same. */}
        {liveValue !== undefined && (
          <path d={arcPath(32, 32, 20, -135, (liveValue / 127) * 270 - 135)} className="knob-live" />
        )}
      </svg>
      {editing ? (
        <input
          autoFocus
          defaultValue={macro.name}
          onBlur={(e) => {
            onRename(e.target.value);
            setEditing(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      ) : (
        <label onDoubleClick={() => setEditing(true)}>{macro.name}</label>
      )}
      <button className="color-swatch" style={{ background: color }} onClick={() => setPickingColor(true)} />
      {pickingColor && <ColorPicker onPick={(i) => (onRecolor(i), setPickingColor(false))} onClose={() => setPickingColor(false)} />}
    </div>
  );
}

// SVG arc path helper - standard "polar to cartesian, build an SVG arc command" math.
// Extract to a small shared util once a second component needs it (ChainSelector's
// own indicator, if the screenshot shows one, likely will).
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const point = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [sx, sy] = point(startDeg);
  const [ex, ey] = point(endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
}
```

### 3.3 `RackHeader.tsx`

```tsx
interface RackHeaderProps {
  rack: Rack;
  onRename: (name: string) => void;
  onSetMacroCount: (count: number) => void;
}

export function RackHeader({ rack, onRename, onSetMacroCount }: RackHeaderProps) {
  const [editing, setEditing] = useState(false);
  return (
    <header className="rack-header">
      {editing ? (
        <input
          autoFocus
          defaultValue={rack.name}
          onBlur={(e) => {
            onRename(e.target.value);
            setEditing(false);
          }}
        />
      ) : (
        <h2 onDoubleClick={() => setEditing(true)}>{rack.name}</h2>
      )}
      <div className="macro-count-control">
        <button disabled={rack.macroCount <= 1} onClick={() => onSetMacroCount(rack.macroCount - 1)}>
          -
        </button>
        <span>{rack.macroCount}</span>
        <button disabled={rack.macroCount >= 16} onClick={() => onSetMacroCount(rack.macroCount + 1)}>
          +
        </button>
      </div>
    </header>
  );
}
```

The actual +/- affordance shape comes from Part 1.1.3 - this is a
placeholder using literal buttons until the real control is identified.

### 3.4 `MacroBank.tsx`

Grid of `MacroKnob`, only rendering up to `macroCount` prominently (the
"shrink hides, doesn't delete" rule from Part 2.4 means slots beyond
`macroCount` that are still mapped need SOME visibility - a compact
"+2 hidden, still mapped" affordance rather than nothing, exact treatment
left open pending a look at whether Ableton itself shows anything here).

```tsx
interface MacroBankProps {
  macros: readonly Macro[];        // always 16 from adg-codec; slice by macroCount for the primary grid
  liveValues?: Record<number, number>;
  armed: ParamRef | null;
  onReorder: (from: number, to: number) => void;
  onSwap: (a: number, b: number) => void;
  onBindArmed: (macroIndex: number) => void;
  onUnbindOne: (macroIndex: number, targetPath: string) => void;
  onRename: (index: number, name: string) => void;
  onRecolor: (index: number, colorIndex: number) => void;
}

export function MacroBank({ macros, liveValues, armed, onReorder, onSwap, onBindArmed, onRename, onRecolor }: MacroBankProps) {
  return (
    <div className="macro-bank">
      {macros.map((macro) => (
        <MacroKnob
          key={macro.index}
          macro={macro}
          liveValue={liveValues?.[macro.index]}
          armed={armed !== null}
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/macro-index', String(macro.index))}
          onDrop={(from) => (from === macro.index ? undefined : onReorder(from, macro.index))}
          onClick={() => onBindArmed(macro.index)}
          onRename={(name) => onRename(macro.index, name)}
          onRecolor={(colorIndex) => onRecolor(macro.index, colorIndex)}
        />
      ))}
    </div>
  );
}
```

(Shift-drop-for-swap from Part 2.1 wires `onSwap` similarly to the
`onReorder` path in `MacroKnob`'s `onDrop` handler - checking
`e.shiftKey`, matching `PLAN.md`'s original macro-slot sketch.)

### 3.5-3.9 Chain list, device rows, nested racks

```tsx
function ChainList({ chains, armed, onArm }: { chains: readonly Chain[]; armed: ParamRef | null; onArm: (p: ParamRef) => void }) {
  return (
    <div className="chain-list">
      {chains.map((chain) => (
        <ChainPanel key={chain.path} chain={chain} armed={armed} onArm={onArm} />
      ))}
    </div>
  );
}

function ChainPanel({ chain, armed, onArm }: { chain: Chain; armed: ParamRef | null; onArm: (p: ParamRef) => void }) {
  return (
    <section className="chain-panel">
      <h3 className="chain-name">{chain.name || 'Chain'}</h3>
      {chain.devices.map((device) =>
        device.isRack ? (
          <NestedRackPanel key={device.path} device={device} armed={armed} onArm={onArm} />
        ) : (
          <DeviceRow key={device.path} device={device} armed={armed} onArm={onArm} />
        ),
      )}
    </section>
  );
}

function DeviceRow({ device, armed, onArm }: { device: DeviceNode; armed: ParamRef | null; onArm: (p: ParamRef) => void }) {
  const [showMore, setShowMore] = useState(false);
  // Derived every render, never stored - see Part 2.5.
  const mapped = device.parameters.filter((p) => p.boundToMacro !== null);
  const unmapped = device.parameters.filter((p) => p.boundToMacro === null);

  return (
    <div className="device-row">
      <span className="device-name">{device.name}</span>
      <ul className="mapped-params">
        {mapped.map((p) => (
          <li key={p.path} className={armed?.path === p.path ? 'armed' : ''} onClick={() => onArm(p)}>
            {p.name} <span className="macro-badge">M{p.boundToMacro! + 1}</span>
          </li>
        ))}
      </ul>
      {unmapped.length > 0 && (
        <>
          <button className="more-toggle" onClick={() => setShowMore((s) => !s)}>
            {showMore ? 'less' : `more (${unmapped.length})`}
          </button>
          {showMore && (
            <ul className="unmapped-params">
              {unmapped.map((p) => (
                <li key={p.path} className={armed?.path === p.path ? 'armed' : ''} onClick={() => onArm(p)}>
                  {p.name}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function NestedRackPanel({ device, armed, onArm }: { device: DeviceNode; armed: ParamRef | null; onArm: (p: ParamRef) => void }) {
  const [open, setOpen] = useState(false); // collapsed by default, Part 2.6
  return (
    <div className="nested-rack-panel">
      <button className="nested-rack-header" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} {device.name}
      </button>
      {open && (
        <div className="nested-rack-body">
          <ChainList chains={device.chains} armed={armed} onArm={onArm} />
        </div>
      )}
    </div>
  );
}
```

A nested rack's OWN macro bank (its `MacroControls.N` family) is not shown
by this recursion as currently sketched - `NestedRackPanel` only recurses
into `device.chains`, which walks the nested rack's device tree, not its
own macro knobs. Decide during implementation whether nested racks need
their own visible `MacroBank` too (probably yes, for a Drum Rack's pad-level
racks specifically, matching the user's own example structure in
`SCHEMA.md`'s `drum-nested.adg`), or whether outer-macro-to-inner-macro
chaining is enough that a nested `MacroBank` is redundant. This is a real
open design question, not an oversight - flag it for the project owner
rather than guessing.

---

## Part 4: New `adg-codec` mutations this UI needs

**Built.** All five are in `packages/adg-codec/src/mutate.ts`, exported from
the package index, and tested both synthetically and against the real
fixtures. The specs below stand as written except where noted per entry.

Three decisions taken during implementation, none of them in the spec above:

1. **`swapMacros` now exchanges every per-slot field**, not just name,
   colour and stored value. `SCHEMA.md` Q7 lists seven `<Field>.N` families
   (adding `MacroDefaults`, `MacroAnnotations`, `ForceDisplayGenericValue`,
   `ExcludeMacroFromRandomization`, `ExcludeMacroFromSnapshots`), and a swap
   that moved only the two the typed model exposes left a macro's annotation
   and randomization flag behind on the slot it came from. Since
   `reorderMacro` is built out of adjacent swaps, it inherits this. All seven
   confirmed present x16 per rack in all three real fixtures.
2. **`unbindOne` clears a macro's variation values only when the removed
   binding was its last.** While the macro still drives something else its
   stored per-variation positions are live, and clearing them would break
   every variation in the rack. `unbindMacro` still clears unconditionally,
   which is right there - it removes everything.
3. **`adg-tool move` now runs `reorderMacro`**, not `moveMapping`. Running
   the old command on a real rack produced exactly the confusing result the
   distinction in Part 2.1 predicts: the destination knob kept its old name
   over the incoming mapping, and its own mapping was silently destroyed.
   `moveMapping` remains available as `adg-tool move-mapping`.

### 4.1 `reorderMacro(rack, from, to): MutationResult`

Shifts, not swaps (Part 2.1). Moves the macro at `from` to position `to`,
sliding every macro between them by one. This is the most involved of the
new mutations: unlike `moveMapping` (which only ever touches `NoteOrController`
on existing `KeyMidi` elements), a full reorder must move name, color,
stored value (`MacroControls.N/Manual`), ALL bindings, AND every variation's
value/hasValue for every index in the shifted range - not just two slots
like `swapMacros`. Implement as repeated adjacent swaps (`from` toward `to`,
one step at a time, reusing `swapMacros`'s internals per-step) rather than
a bespoke bulk operation - simpler to get right, and the constraint-4
permutation is already correct per-swap.

```typescript
export function reorderMacro(rack: Rack, from: number, to: number): MutationResult {
  // walk from -> to one step at a time, swapping adjacent slots each step
}
```

### 4.2 `setMacroCount(rack, count): MutationResult`

Writes `NumVisibleMacroControls` directly (`SCHEMA.md` Q7: this is a single
integer fact, no other element changes). Validate `1 <= count <= 16`.

### 4.3 `renameRack(rack, name): MutationResult`

Writes the rack device's `UserName` child (Part 0's `rack.name` getter
already reads it - this is the missing write side). Unconfirmed against a
real diff yet whether `UserName` alone is sufficient or whether Ableton
writes anything else on a rename (patchbay's own notes mention `UserName`
lags one save in some contexts - reread `SCHEMA.md`/patchbay's `UserName`
discussion before trusting a bare single-field write).

### 4.4 `setMacroColor(rack, macroIndex, colorIndex): MutationResult`

Writes `MacroColor.N` directly. Depends on Part 1.3's palette table only
for the UI side (picking a swatch); the mutation itself just writes
whatever integer index it's given.

### 4.5 `unbindOne(rack, macroIndex, targetPath): MutationResult`

The narrower sibling `unbindMacro` doesn't provide (Part 2.5): removes the
ONE `KeyMidi` on the parameter at `targetPath` (resolved the same way
`bindParameter` resolves targets), for macros that drive several
parameters and should keep the others. Should verify the found `KeyMidi`
actually belongs to `macroIndex` before removing it (defensive - a caller
passing a mismatched pair is a bug worth surfacing, not silently doing the
wrong thing).

---

## Build order

1. Part 1 (SVG + palette extraction) - **on hold, do not start until told**.
2. ~~Part 4 (new mutations)~~ - **done**, tested against the real fixtures
   per the existing pattern (`packages/adg-codec/tests/real-fixtures.test.ts`).
3. Part 3 minus real SVG (use Part 3.2's placeholder shapes) - get the
   component tree, drag-reorder, arm/bind, and mapped/"more" logic working
   end to end against the synthetic fixture and `apps/site`'s dev server,
   without waiting on Part 1.
4. Swap in Part 1's real SVG/palette once ready - should be a localized
   change to `MacroKnob.tsx` and `editor.css`, not a structural one, if
   Part 3 was built against the placeholder cleanly.
5. Wire `apps/m4l-device`'s `App.tsx` to the same `RackEditor` from
   `packages/editor-ui`, per `PLAN.md` Phase 5.4.

Test each stage the same way the codec was tested: against real racks
dropped in a gitignored local location, not just synthetic fixtures - this
session's two real bugs (multi-target macros, the missing XML declaration)
were both invisible to synthetic tests and only found by using the tool for
real.
