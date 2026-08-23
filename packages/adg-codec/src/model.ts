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
  value: number; // stored position, 0..127
  binding: Binding | null;
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
  /** Path relative to the owning Rack's BranchPresets root (see `dom.ts` pathOf/resolvePath). */
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
   * A deep, independent copy for undo stacks (doc/PLAN.md Phase 2.1). Goes
   * through serialize+reparse rather than `cloneNode` + cross-document
   * adoption - a full reparse of a several-thousand-element rack is a few
   * milliseconds, cheap enough to trade for not having to reason about
   * adoption edge cases across DOM implementations (browser vs jsdom).
   */
  clone(): Rack {
    return Rack.fromXml(serializeXmlDoc(this.doc));
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
      const value = Number(childValue(mc, 'Manual') ?? 0);
      const keyMidi = bindings.get(i) ?? null;
      macros.push({ index: i, name, value, binding: keyMidi ? this.describeBinding(keyMidi) : null });
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
    const bp = this.branchPresetsEl;
    return bp ? resolvePath(bp, path) : null;
  }

  /** @internal Path of an element relative to this rack's BranchPresets root. */
  pathOf(target: Element): string {
    const bp = this.branchPresetsEl;
    if (!bp) throw new Error('rack has no BranchPresets');
    return pathOf(bp, target);
  }

  /**
   * @internal Every KeyMidi belonging to THIS rack's own macros (Channel=16,
   * owning rack resolves to this.deviceEl per the structural walk), keyed by
   * macro index. Nested racks' own macro mappings are excluded even though
   * they reuse the same index space - see the class doc comment.
   */
  collectMacroBindings(): Map<number, Element> {
    const bp = this.branchPresetsEl;
    const result = new Map<number, Element>();
    if (!bp) return result;
    for (const keyMidi of Array.from(bp.getElementsByTagName('KeyMidi'))) {
      if (childValue(keyMidi, 'Channel') !== '16') continue; // not a macro mapping (SCHEMA.md Q1)
      if (this.owningRackDevice(keyMidi) !== this.deviceEl) continue; // belongs to a nested rack's own macro
      const index = Number(childValue(keyMidi, 'NoteOrController'));
      result.set(index, keyMidi);
    }
    return result;
  }

  /** @internal SCHEMA.md Q2 / patchbay ARCHITECTURE.md §5: walk up to the nearest BranchPresets, then that element's parent's Device child. */
  private owningRackDevice(el: Element): Element | null {
    let node: Element | null = el.parentElement;
    while (node && node.tagName !== 'BranchPresets') node = node.parentElement;
    const groupDevicePreset = node?.parentElement ?? null;
    const device = child(groupDevicePreset, 'Device');
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
    return elementChildren(branchPresets).map((branchPreset) => ({
      path: this.pathOf(branchPreset),
      name: childValue(branchPreset, 'Name') || branchPreset.tagName,
      devices: (child(branchPreset, 'DevicePresets') ? elementChildren(child(branchPreset, 'DevicePresets')!) : []).map((dp) =>
        this.walkDevicePreset(dp),
      ),
    }));
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
   * Any element that directly owns a `Timeable` child is a bindable
   * parameter (SCHEMA.md Q1) - stop descending there, its own descendants
   * (KeyMidi, Manual, ...) aren't further parameters. Otherwise recurse,
   * except into BranchPresets/DevicePresets, which `walkChains` already
   * covers from the rack-nesting side.
   */
  private collectParameters(el: Element): ParamRef[] {
    const result: ParamRef[] = [];
    const walk = (node: Element) => {
      for (const c of elementChildren(node)) {
        const timeable = child(c, 'Timeable');
        if (timeable) {
          const keyMidi = child(timeable, 'KeyMidi');
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
        if (c.tagName !== 'BranchPresets' && c.tagName !== 'DevicePresets') walk(c);
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
