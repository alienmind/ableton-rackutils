/**
 * The rack model. Design: the parsed DOM is the source of truth (doc/PLAN.md
 * Phase 2.1) - mutations edit the DOM directly, and everything below is a
 * read-through view recomputed on each access. `Rack.clone()` deep-clones the
 * DOM for undo; there is no pure-data representation to keep in sync.
 *
 * Everything below is traced to a diff in SCHEMA.md. In particular:
 *
 * - A macro mapping is a `KeyMidi` element that is a DESCENDANT of the target
 *   parameter (SCHEMA.md Q1/Q2) - not an id reference. `NoteOrController` on
 *   that KeyMidi is the macro index.
 * - Which RACK a KeyMidi's macro belongs to is not stored either. It's
 *   resolved structurally: walk up from the KeyMidi to the nearest
 *   `BranchPresets` ancestor, then that element's parent `GroupDevicePreset`
 *   holds the owning rack in its `Device` child (SCHEMA.md Q2, patchbay
 *   ARCHITECTURE.md §5). This matters because a nested rack's OWN macros
 *   reuse the same 0-15 index space and the same Channel=16, so naively
 *   matching on `NoteOrController` alone would also match a child rack's
 *   unrelated mapping.
 */
import { child, childValue, elementChildren, parseXmlDoc, pathOf, resolvePath, serializeXmlDoc } from './dom';
import { compress, decompress } from './gzip';

export const MACRO_SLOTS = 16;
/** The "unset" sentinel Live itself writes for an unmapped macro slot (SCHEMA.md Q5/Q6). */
export const UNSET_MACRO_VALUE = -1;

export interface Macro {
  index: number; // 0-based slot
  name: string;
  /** `MacroColor.N`, the palette index Live's colour picker writes. */
  color: number;
  value: number; // stored position, 0..127
  /**
   * A macro can drive SEVERAL parameters at once - completely normal Live
   * usage (turn one knob, several things move), confirmed the hard way: an
   * earlier version of this codec assumed at most one target per macro and
   * `moveMapping` silently left a macro's second target behind on a real
   * rack. Constraint 5 (one macro per PARAMETER) is a real rule; there is no
   * such rule the other way round. Empty array, never null, when unmapped.
   */
  bindings: Binding[];
}

export interface Binding {
  /** Path to the target parameter, relative to the rack's BranchPresets root. Re-resolvable via Rack internals; also the display path. */
  targetPath: string;
  targetName: string;
  rangeMin: number;
  rangeMax: number;
  /** Min > Max on MidiControllerRange. Live honours it (SCHEMA.md Q4). */
  inverted: boolean;
}

export interface ParamRef {
  /** Path relative to the owning Rack's `GroupDevicePreset` (see `dom.ts` pathOf/resolvePath). */
  path: string;
  name: string;
  boundToMacro: number | null;
}

export interface DeviceNode {
  path: string;
  type: string; // the device's own XML tag name, e.g. "Operator", "InstrumentGroupDevice"
  name: string;
  isRack: boolean;
  chains: Chain[];
  parameters: ParamRef[];
}

export interface Chain {
  path: string;
  name: string;
  devices: DeviceNode[];
  /**
   * Drum rack pads only (`DrumBranchPreset`, SCHEMA.md Q10) - null on an
   * ordinary chain. `receivingNote` is the MIDI note the pad answers to and
   * the only thing identifying a pad's position; the grid geometry Live
   * displays it in is NOT confirmed, so order by note rather than trying to
   * reproduce `PadScrollPosition`.
   */
  receivingNote: number | null;
  sendingNote: number | null;
  chokeGroup: number | null;
  /**
   * `DocumentColorIndex`, a palette index like `Macro.color` and with the same
   * caveat: the index -> colour table is not confirmed (SCHEMA.md Q13). Every
   * chain in every fixture here is `AutoColored`, so they all carry the same
   * value and this project has never seen it vary.
   */
  colorIndex: number | null;
  /** `AutoColored` - Live picked the colour rather than the user. */
  autoColored: boolean;
}

export interface Variation {
  index: number;
  name: string;
  /** Always MACRO_SLOTS long - all 16 slots are stored regardless of visible macro count (SCHEMA.md Q5/Q7). Unmapped/unparticipating slots read UNSET_MACRO_VALUE. */
  values: number[];
}

/** Opaque handle owning a mutable DOM. Clone before mutating to keep the previous state (undo). */
export class Rack {
  private constructor(
    private readonly doc: Document,
    /** `GroupDevicePreset`, the rack's root element. */
    private readonly root: Element,
  ) {}

  static parse(bytes: Uint8Array): Rack {
    return Rack.fromXml(decompress(bytes));
  }

  private static fromXml(xml: string): Rack {
    const doc = parseXmlDoc(xml);
    const root = child(doc.documentElement, 'GroupDevicePreset');
    if (!root) throw new Error('not a rack preset: no GroupDevicePreset at the document root');
    return new Rack(doc, root);
  }

  /**
   * A view of a NESTED rack, given the path of one of this rack's `isRack`
   * DeviceNodes. Shares the same document: mutating the returned Rack edits
   * the same file, and serializing either handle writes the whole file, not
   * the fragment.
   *
   * This exists because nested racks are structurally identical to the root
   * one - a `GroupDevicePreset` with a `Device` and a `BranchPresets` sibling
   * (SCHEMA.md Q8) - so every getter and every mutation already works on one
   * unmodified, as long as it is pointed at the right root.
   *
   * Paths are relative to the rack they came from. A `ParamRef` read from a
   * sub-rack only resolves against that sub-rack, so keep the two together;
   * mixing a nested path with the root handle silently resolves to the wrong
   * element or to nothing.
   */
  subRack(devicePath: string): Rack | null {
    const el = this.resolveTarget(devicePath);
    if (!el || el.tagName !== 'GroupDevicePreset') return null;
    return new Rack(this.doc, el);
  }

  /**
   * A deep, independent copy for undo stacks (doc/PLAN.md Phase 2.1). Goes
   * through serialize+reparse rather than `cloneNode` + cross-document
   * adoption - a full reparse of a several-thousand-element rack is a few
   * milliseconds, cheap enough to trade for not having to reason about
   * adoption edge cases across DOM implementations (browser vs jsdom).
   *
   * Cloning a sub-rack view clones the whole document and returns a view at
   * the same position in the copy, not a rack rooted back at the top.
   */
  clone(): Rack {
    const doc = parseXmlDoc(serializeXmlDoc(this.doc));
    const rootPath = pathOf(this.doc.documentElement, this.root);
    const root = resolvePath(doc.documentElement, rootPath);
    if (!root) throw new Error('clone lost its rack root - the document shape changed under it');
    return new Rack(doc, root);
  }

  serialize(): Uint8Array {
    return compress(serializeXmlDoc(this.doc));
  }

  /** `Device`'s single element child - `InstrumentGroupDevice`/`AudioEffectGroupDevice`/`DrumGroupDevice`. Holds the rack's own macros. */
  get deviceEl(): Element {
    const wrap = child(this.root, 'Device');
    const el = wrap?.firstElementChild;
    if (!el) throw new Error('rack preset has no Device element');
    return el;
  }

  /** `BranchPresets` - the rack's chains and their devices. Sibling of `Device`, never a descendant of it (SCHEMA.md Q2). */
  get branchPresetsEl(): Element | null {
    return child(this.root, 'BranchPresets');
  }

  get name(): string {
    return childValue(this.deviceEl, 'UserName') || this.deviceEl.tagName;
  }

  /** Visible macro count (1..16, SCHEMA.md Q7). All 16 slots always exist regardless. */
  get macroCount(): number {
    return Number(childValue(this.deviceEl, 'NumVisibleMacroControls') ?? 8);
  }

  get macros(): Macro[] {
    const device = this.deviceEl;
    const bindings = this.collectMacroBindings();
    const macros: Macro[] = [];
    for (let i = 0; i < MACRO_SLOTS; i++) {
      const mc = child(device, `MacroControls.${i}`);
      const name = childValue(device, `MacroDisplayNames.${i}`) ?? `Macro ${i + 1}`;
      const color = Number(childValue(device, `MacroColor.${i}`) ?? 0);
      const value = Number(childValue(mc, 'Manual') ?? 0);
      const keyMidis = bindings.get(i) ?? [];
      macros.push({ index: i, name, color, value, bindings: keyMidis.map((km) => this.describeBinding(km)) });
    }
    return macros;
  }

  get variations(): Variation[] {
    const snapshots = this.macroSnapshotsEl;
    if (!snapshots) return [];
    return elementChildren(snapshots)
      .filter((el) => el.tagName === 'MacroSnapshot')
      .map((snap, index) => ({
        index,
        name: childValue(snap, 'SnapshotName') ?? `Variation ${index + 1}`,
        values: Array.from({ length: MACRO_SLOTS }, (_, i) => Number(childValue(snap, `MacroValues.${i}`) ?? UNSET_MACRO_VALUE)),
      }));
  }

  get chains(): Chain[] {
    const bp = this.branchPresetsEl;
    return bp ? this.walkChains(bp) : [];
  }

  // --- internals, exported for mutate.ts (same package, not part of the public API) ---

  /** @internal */
  get macroVariationsEl(): Element | null {
    return child(this.deviceEl, 'MacroVariations');
  }

  /** @internal */
  get macroSnapshotsEl(): Element | null {
    return child(this.macroVariationsEl, 'MacroSnapshots');
  }

  /** @internal Resolve a ParamRef/path against this rack's current DOM. */
  resolveTarget(path: string): Element | null {
    return resolvePath(this.root, path);
  }

  /**
   * @internal Path of an element relative to this rack's `GroupDevicePreset`.
   *
   * Rooted at the preset, not at `BranchPresets`, because a macro can drive a
   * parameter of the rack device ITSELF - `ChainSelector` is one, SCHEMA.md
   * Q15 - and `Device` is a sibling of `BranchPresets`, so a BranchPresets-
   * rooted path cannot address it at all.
   */
  pathOf(target: Element): string {
    return pathOf(this.root, target);
  }

  /**
   * @internal Every KeyMidi belonging to THIS rack's own macros (Channel=16,
   * owning rack resolves to this.deviceEl per the structural walk), keyed by
   * macro index. A macro index can map to SEVERAL KeyMidi elements - a macro
   * driving multiple parameters at once is normal Live usage, not an edge
   * case. Nested racks' own macro mappings are excluded even though they
   * reuse the same index space - see the class doc comment.
   */
  collectMacroBindings(): Map<number, Element[]> {
    const result = new Map<number, Element[]>();
    // Scans the whole preset, not just BranchPresets: a macro can drive the
    // rack device's own parameters (SCHEMA.md Q15).
    for (const keyMidi of Array.from(this.root.getElementsByTagName('KeyMidi'))) {
      if (childValue(keyMidi, 'Channel') !== '16') continue; // not a macro mapping (SCHEMA.md Q1)
      if (this.owningRackDevice(keyMidi) !== this.deviceEl) continue; // belongs to a nested rack's own macro
      const index = Number(childValue(keyMidi, 'NoteOrController'));
      const list = result.get(index);
      if (list) list.push(keyMidi);
      else result.set(index, [keyMidi]);
    }
    return result;
  }

  /**
   * @internal Macro bindings that are NOT `KeyMidi`, keyed by macro index.
   *
   * A plugin parameter is driven by an integer `MacroControlIndex` on its
   * `PluginParameterSettings`, and a plugin's own on/off by
   * `PowerMacroControlIndex` on the preset (SCHEMA.md Q20). Neither is a
   * `KeyMidi`, so `collectMacroBindings` cannot see them, and every
   * slot-changing mutation has to move these too or leave them pointing at a
   * vacated slot.
   *
   * `-1` means unmapped and is skipped.
   */
  collectPluginMacroRefs(): Map<number, Element[]> {
    const result = new Map<number, Element[]>();
    for (const tag of ['MacroControlIndex', 'PowerMacroControlIndex']) {
      for (const el of Array.from(this.root.getElementsByTagName(tag))) {
        if (this.owningRackDevice(el) !== this.deviceEl) continue;
        const index = Number(el.getAttribute('Value'));
        if (!Number.isInteger(index) || index < 0) continue;
        const list = result.get(index);
        if (list) list.push(el);
        else result.set(index, [el]);
      }
    }
    return result;
  }

  /**
   * @internal Which rack's macros a KeyMidi belongs to: walk up to the nearest
   * `GroupDevicePreset`, then take its `Device` child (SCHEMA.md Q2).
   *
   * The walk stops at the PRESET rather than at the rack device, because the
   * rack device is a SIBLING of `BranchPresets`, not an ancestor of it - a
   * binding on a device inside a chain never passes through it. Stopping at
   * the preset is the one point both shapes share: a chain device's binding
   * reaches it going up through `BranchPresets`, and a binding on the rack's
   * own parameter (`ChainSelector`, SCHEMA.md Q15) reaches it going up through
   * `Device`. An earlier version stopped at `BranchPresets`, which the second
   * shape has none of, so it ran past and returned null.
   */
  private owningRackDevice(el: Element): Element | null {
    let node: Element | null = el.parentElement;
    while (node && node.tagName !== 'GroupDevicePreset') node = node.parentElement;
    const device = child(node, 'Device');
    return device?.firstElementChild ?? null;
  }

  /** @internal The target parameter a KeyMidi lives on: its parent, or if wrapped, its parent's parent (SCHEMA.md Q1's `Timeable` finding). */
  targetParameterOf(keyMidi: Element): Element {
    const parent = keyMidi.parentElement!;
    return parent.tagName === 'Timeable' ? parent.parentElement! : parent;
  }

  private describeBinding(keyMidi: Element): Binding {
    const container = keyMidi.parentElement!; // Timeable, or the parameter itself
    const target = this.targetParameterOf(keyMidi);
    const range = child(container, 'MidiControllerRange');
    const min = Number(childValue(range, 'Min') ?? 0);
    const max = Number(childValue(range, 'Max') ?? 127);
    return {
      targetPath: this.pathOf(target),
      targetName: childValue(target, 'Name') ?? target.tagName,
      rangeMin: min,
      rangeMax: max,
      inverted: min > max,
    };
  }

  private walkChains(branchPresets: Element): Chain[] {
    return elementChildren(branchPresets).map((branchPreset) => {
      // A drum pad's note assignment (SCHEMA.md Q10). Absent on every other
      // branch type, so these read null rather than a default note.
      const zone = child(branchPreset, 'ZoneSettings');
      const note = (tag: string) => {
        const raw = childValue(zone, tag);
        return raw === null ? null : Number(raw);
      };
      const colorIndex = childValue(branchPreset, 'DocumentColorIndex');
      return {
        path: this.pathOf(branchPreset),
        // An unnamed chain reports '' - Live shows no name for one either.
        // Do NOT substitute the XML tag: "InstrumentBranchPreset" is not a
        // name a user ever chose, and it reads as one in a UI.
        name: childValue(branchPreset, 'Name') ?? '',
        devices: (child(branchPreset, 'DevicePresets') ? elementChildren(child(branchPreset, 'DevicePresets')!) : []).map((dp) =>
          this.walkDevicePreset(dp),
        ),
        receivingNote: note('ReceivingNote'),
        sendingNote: note('SendingNote'),
        chokeGroup: note('ChokeGroup'),
        colorIndex: colorIndex === null ? null : Number(colorIndex),
        autoColored: childValue(branchPreset, 'AutoColored') === 'true',
      };
    });
  }

  private walkDevicePreset(preset: Element): DeviceNode {
    if (preset.tagName === 'GroupDevicePreset') {
      // A nested rack: same Device/BranchPresets sibling shape as the root (SCHEMA.md Q8).
      const wrap = child(preset, 'Device');
      const groupDevice = wrap?.firstElementChild;
      const bp = child(preset, 'BranchPresets');
      return {
        path: this.pathOf(preset),
        type: groupDevice?.tagName ?? 'GroupDevicePreset',
        name: (groupDevice && childValue(groupDevice, 'UserName')) || groupDevice?.tagName || 'Rack',
        isRack: true,
        chains: bp ? this.walkChains(bp) : [],
        parameters: groupDevice ? this.collectParameters(groupDevice) : [],
      };
    }
    // A plain device (usually AbletonDevicePreset > Device > <ActualDeviceTag>, sometimes a
    // differently-named wrapper for Max-for-Live-hosted instruments - both shaped the same).
    const wrap = child(preset, 'Device');
    const actual = wrap?.firstElementChild ?? preset;
    return {
      path: this.pathOf(preset),
      type: actual.tagName,
      name: childValue(actual, 'UserName') || actual.tagName,
      isRack: false,
      chains: [],
      parameters: this.collectParameters(actual),
    };
  }

  /**
   * A bindable parameter is an element owning an `AutomationTarget`, either
   * directly (every native Ableton device: `<DecayTime><LomId/><Manual/>...`)
   * or inside a `Timeable` child (Max-hosted devices, SCHEMA.md Q1/Q11).
   * Keying on `Timeable` alone found ZERO parameters on Eq8, Reverb, Delay,
   * Simpler and rack devices, while reporting 61 on a Max device - the bug
   * stayed invisible because mappings come from `collectMacroBindings`, which
   * walks KeyMidi directly and never consults this.
   *
   * `AutomationTarget` is the marker rather than `Manual` or
   * `MidiControllerRange` because it means exactly "Live can automate this",
   * which is the same set of things a macro can drive.
   *
   * Stop descending at a match - a parameter's own children (KeyMidi, Manual,
   * ...) are not further parameters. Otherwise recurse, except into
   * BranchPresets/DevicePresets, which `walkChains` covers from the
   * rack-nesting side.
   */
  private collectParameters(el: Element): ParamRef[] {
    const result: ParamRef[] = [];
    const walk = (node: Element) => {
      for (const c of elementChildren(node)) {
        if (c.tagName === 'BranchPresets' || c.tagName === 'DevicePresets') continue;
        const container = child(c, 'Timeable') ?? c;
        if (child(container, 'AutomationTarget')) {
          const keyMidi = child(container, 'KeyMidi');
          // Channel 16 is specifically the macro bus (SCHEMA.md Q1) - a real
          // MIDI CC mapping (any other channel) isn't a macro binding.
          const isMacro = keyMidi && childValue(keyMidi, 'Channel') === '16';
          result.push({
            path: this.pathOf(c),
            name: childValue(c, 'Name') || c.tagName,
            boundToMacro: isMacro ? Number(childValue(keyMidi, 'NoteOrController')) : null,
          });
          continue;
        }
        walk(c);
      }
    };
    walk(el);
    return result;
  }

  /** @internal doc access for mutate.ts (createElement etc). */
  get document(): Document {
    return this.doc;
  }
}
