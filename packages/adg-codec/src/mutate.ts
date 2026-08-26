/**
 * Mutations. All take a `Rack` and edit its DOM in place - clone first (see
 * `Rack.clone()`) to keep the previous state for undo.
 *
 * Every mutation that changes which macro slot drives what routes through
 * `permuteVariations` (Constraint 4, doc/PLAN.md): a rack's saved Macro
 * Variations store values per SLOT INDEX, so moving a mapping from macro 2 to
 * macro 3 without also permuting every variation's stored values leaves the
 * old macro-2 value in a now-unrelated slot. This is the single easiest way
 * to corrupt a rack, and it is not enforced by the file format at all - nothing
 * stops writing a `KeyMidi` change with stale `MacroSnapshot` values sitting
 * right next to it.
 */
import { child, childValue, createValueEl, elementChildren, insertAfterLomId, parseXmlDoc, setChildValue } from './dom';
import { DONOR_DEVICES } from './donorLibrary.generated';
import { MACRO_SLOTS, Rack, UNSET_MACRO_VALUE, type ParamRef } from './model';

export interface MutationResult {
  ok: boolean;
  warnings: string[];
}

const ok = (warnings: string[] = []): MutationResult => ({ ok: true, warnings });
const fail = (warning: string): MutationResult => ({ ok: false, warnings: [warning] });

/**
 * Move ALL of `from`'s bindings to `to` - a macro can drive several
 * parameters at once (normal Live usage), so this moves every one of them,
 * not just the first found. If `to` already had bindings of its own, all of
 * those are cleared and reported in warnings. Not a node move (SCHEMA.md Q3):
 * each KeyMidi stays on its own target parameter, only its NoteOrController
 * value changes.
 */
export function moveMapping(rack: Rack, from: number, to: number): MutationResult {
  if (from === to) return ok();
  assertSlot(from);
  assertSlot(to);
  const bindings = rack.collectMacroBindings();
  // Plugin parameters bind by an index rather than a KeyMidi (SCHEMA.md Q20),
  // so a macro can be driving something while having no KeyMidi at all.
  const pluginRefs = rack.collectPluginMacroRefs();
  const fromKeyMidis = bindings.get(from) ?? [];
  const fromPlugin = pluginRefs.get(from) ?? [];
  if (fromKeyMidis.length === 0 && fromPlugin.length === 0) {
    return fail(`macro ${from + 1} has no mapping to move`);
  }

  const warnings: string[] = [];
  const toKeyMidis = bindings.get(to) ?? [];
  const toPlugin = pluginRefs.get(to) ?? [];
  const cleared = toKeyMidis.length + toPlugin.length;
  if (cleared > 0) {
    warnings.push(`cleared ${cleared} existing binding${cleared > 1 ? 's' : ''} on macro ${to + 1}`);
    for (const km of toKeyMidis) removeKeyMidi(km);
    // Cleared by writing -1: the parameter stays exposed, it stops being driven.
    for (const el of toPlugin) el.setAttribute('Value', '-1');
  }
  for (const km of fromKeyMidis) setChildValue(km, 'NoteOrController', to);
  for (const el of fromPlugin) el.setAttribute('Value', String(to));

  permuteVariations(rack, (values) => {
    values[to] = values[from];
    values[from] = UNSET_MACRO_VALUE;
  });
  return ok(warnings);
}

/**
 * Exchange everything the two slots own: all bindings (in both directions),
 * every per-slot field in `PER_SLOT_FIELDS`, the stored value, and every
 * variation's value. A swap moves the whole macro, so a user who drags knob 5
 * onto knob 2 gets knob 5's annotation and randomization flags along with its
 * name and colour, rather than a macro that half moved.
 */
export function swapMacros(rack: Rack, a: number, b: number): MutationResult {
  if (a === b) return ok();
  assertSlot(a);
  assertSlot(b);

  const bindings = rack.collectMacroBindings();
  const aKeyMidis = bindings.get(a) ?? [];
  const bKeyMidis = bindings.get(b) ?? [];
  for (const km of aKeyMidis) setChildValue(km, 'NoteOrController', b);
  for (const km of bKeyMidis) setChildValue(km, 'NoteOrController', a);

  // Same for plugin parameters, which bind by index (SCHEMA.md Q20).
  const pluginRefs = rack.collectPluginMacroRefs();
  const aPlugin = pluginRefs.get(a) ?? [];
  const bPlugin = pluginRefs.get(b) ?? [];
  for (const el of aPlugin) el.setAttribute('Value', String(b));
  for (const el of bPlugin) el.setAttribute('Value', String(a));

  const device = rack.deviceEl;
  for (const field of PER_SLOT_FIELDS) swapChildValue(device, `${field}.${a}`, device, `${field}.${b}`);
  swapChildValue(child(device, `MacroControls.${a}`), 'Manual', child(device, `MacroControls.${b}`), 'Manual');

  permuteVariations(rack, (values) => {
    [values[a], values[b]] = [values[b], values[a]];
  });
  return ok();
}

/**
 * Move the macro at `from` to position `to`, sliding everything in between by
 * one - a reorder, not a two-way swap: dropping macro 5 on position 2 pushes
 * 2,3,4 down to 3,4,5. Done as repeated adjacent `swapMacros` calls rather
 * than a bespoke bulk permutation, so the variation handling stays the one
 * already-tested path (Constraint 4) instead of a second implementation of it.
 */
export function reorderMacro(rack: Rack, from: number, to: number): MutationResult {
  if (from === to) return ok();
  assertSlot(from);
  assertSlot(to);
  const step = from < to ? 1 : -1;
  for (let i = from; i !== to; i += step) swapMacros(rack, i, i + step);
  return ok();
}

/**
 * Make room at the FRONT of the macro bank by shifting every macro right by
 * `count`, leaving slots 0..count-1 empty.
 *
 * The contract puts its own macros in the leading slots so they are in the
 * same place on every rack (doc/PLAN.md 4.3.1), which means the rack's
 * existing macros have to move out of the way first.
 *
 * Implemented as repeated `reorderMacro(15, 0)`, which rotates the whole bank
 * right by one and brings the top slot round to the front. That keeps the
 * variation handling on the single already-tested path (Constraint 4) instead
 * of adding a second bulk permutation, and it is lossless precisely because
 * the slots being rotated out are checked to be empty first.
 *
 * Fails rather than silently dropping anything when the top `count` slots
 * carry bindings, which is what a full rack looks like.
 */
export function insertMacroSlots(rack: Rack, count: number): MutationResult {
  if (!Number.isInteger(count) || count < 1 || count >= MACRO_SLOTS) {
    throw new RangeError(`slot count ${count} out of range 1..${MACRO_SLOTS - 1}`);
  }

  const bindings = rack.collectMacroBindings();
  const occupied: number[] = [];
  for (let i = MACRO_SLOTS - count; i < MACRO_SLOTS; i++) {
    if ((bindings.get(i) ?? []).length > 0) occupied.push(i + 1);
  }
  if (occupied.length > 0) {
    return fail(
      `no room to shift: macro${occupied.length > 1 ? 's' : ''} ${occupied.join(', ')} would be pushed off the end`,
    );
  }

  for (let i = 0; i < count; i++) reorderMacro(rack, MACRO_SLOTS - 1, 0);

  // Widen the visible bank so the new slots are reachable, rounded UP to an
  // even number. Live's own +/- steps by two and every rack it wrote in
  // donors/ has an even count (10, 10, 16); an odd one renders the macro grid
  // wrong - a rack taller than a rack is allowed to be - while still loading.
  const wanted = rack.macroCount + count;
  const visible = Math.min(MACRO_SLOTS, wanted + (wanted % 2));
  setMacroCount(rack, visible);
  return ok();
}

/**
 * Set how many macro knobs the rack shows. All 16 slots exist in the file
 * regardless (SCHEMA.md Q7), so shrinking hides macros, it never deletes
 * their bindings - a slot above the new count keeps driving whatever it drove.
 */
export function setMacroCount(rack: Rack, count: number): MutationResult {
  if (!Number.isInteger(count) || count < 1 || count > MACRO_SLOTS) {
    throw new RangeError(`macro count ${count} out of range 1..${MACRO_SLOTS}`);
  }
  setChildValue(rack.deviceEl, 'NumVisibleMacroControls', count);
  return ok();
}

/**
 * Rename the rack itself - the write side of `Rack.name`. Writes `UserName`
 * and nothing else; whether Live writes anything alongside it on its own
 * rename gesture has not been checked against a before/after diff, so this is
 * the one mutation here not fully traced to SCHEMA.md.
 */
export function renameRack(rack: Rack, name: string): MutationResult {
  setChildValue(rack.deviceEl, 'UserName', name);
  return ok();
}

/** Writes `MacroColor.N`, the palette index Live's own colour picker stores. Not range-checked: the palette's size is not confirmed, and guessing a bound would reject colours Live accepts. */
export function setMacroColor(rack: Rack, macroIndex: number, colorIndex: number): MutationResult {
  assertSlot(macroIndex);
  if (!Number.isInteger(colorIndex) || colorIndex < 0) throw new RangeError(`colour index ${colorIndex} is not a non-negative integer`);
  setChildValue(rack.deviceEl, `MacroColor.${macroIndex}`, colorIndex);
  return ok();
}

/**
 * Set a chain's colour (`DocumentColorIndex`, SCHEMA.md Q13) and mark it as
 * chosen rather than auto-assigned. Live sets `AutoColored` to false the
 * moment a user picks a colour by hand; leaving it true would invite Live to
 * recolour the chain again and quietly discard the choice.
 *
 * `chainPath` is a `Chain.path` from the SAME rack handle - paths are relative
 * to the rack they came from (see `Rack.subRack`).
 */
export function setChainColor(rack: Rack, chainPath: string, colorIndex: number): MutationResult {
  if (!Number.isInteger(colorIndex) || colorIndex < 0) throw new RangeError(`colour index ${colorIndex} is not a non-negative integer`);
  const branch = rack.resolveTarget(chainPath);
  if (!branch) return fail(`no chain at "${chainPath}" - it may belong to a stale snapshot`);
  setChildValue(branch, 'DocumentColorIndex', colorIndex);
  setChildValue(branch, 'AutoColored', false);
  return ok();
}

/**
 * Remove ONE of a macro's bindings, leaving its others alone - the narrow
 * sibling of `unbindMacro`, for a macro driving several parameters where only
 * one row's "x" was clicked. Refuses if the parameter at `targetPath` is not
 * actually driven by `macroIndex`: a mismatched pair is a caller bug, and
 * silently unbinding whatever happened to be there instead is the failure
 * mode this codec exists to avoid.
 */
export function unbindOne(rack: Rack, macroIndex: number, targetPath: string): MutationResult {
  assertSlot(macroIndex);
  const targetEl = rack.resolveTarget(targetPath);
  if (!targetEl) return fail(`no parameter at "${targetPath}" - it may belong to a stale snapshot`);

  // A plugin binding is cleared by writing -1 rather than by removing an
  // element: the parameter stays exposed on the device, it just stops being
  // driven (SCHEMA.md Q20).
  if (PLUGIN_INDEX_TAGS.includes(targetEl.tagName)) {
    if (Number(targetEl.getAttribute('Value')) !== macroIndex) {
      return fail(`that plugin parameter is driven by macro ${Number(targetEl.getAttribute('Value')) + 1}, not macro ${macroIndex + 1}`);
    }
    targetEl.setAttribute('Value', '-1');
    return clearVariationsIfLastBinding(rack, macroIndex);
  }

  const container = child(targetEl, 'Timeable') ?? targetEl;
  const keyMidi = child(container, 'KeyMidi');
  if (!keyMidi || childValue(keyMidi, 'Channel') !== '16') return fail('that parameter is not driven by a macro');
  const owner = Number(childValue(keyMidi, 'NoteOrController'));
  if (owner !== macroIndex) return fail(`that parameter is driven by macro ${owner + 1}, not macro ${macroIndex + 1}`);

  removeKeyMidi(keyMidi);
  return clearVariationsIfLastBinding(rack, macroIndex);
}

/**
 * The macro's variation values only become meaningless once it drives nothing
 * at all. While it still has other targets, its stored per-variation positions
 * are live and clearing them would break every variation (Constraint 4).
 *
 * Both kinds of binding count: a macro left driving only a plugin parameter is
 * still driving something.
 */
function clearVariationsIfLastBinding(rack: Rack, macroIndex: number): MutationResult {
  const keyMidis = rack.collectMacroBindings().get(macroIndex) ?? [];
  const plugins = rack.collectPluginMacroRefs().get(macroIndex) ?? [];
  if (keyMidis.length === 0 && plugins.length === 0) {
    permuteVariations(rack, (values) => {
      values[macroIndex] = UNSET_MACRO_VALUE;
    });
  }
  return ok();
}

/**
 * Bind a parameter to a macro, ADDING to whatever else that macro already
 * drives - a macro controlling several parameters at once is normal Live
 * usage, not something to clear. Clears any DIFFERENT macro already driving
 * this parameter (Constraint 5: a parameter can only be driven by one
 * macro - that rule runs the other way round from the one above).
 */
export function bindParameter(
  rack: Rack,
  macroIndex: number,
  target: ParamRef,
  range?: { min: number; max: number },
): MutationResult {
  assertSlot(macroIndex);
  const targetEl = rack.resolveTarget(target.path);
  if (!targetEl) return fail(`target "${target.name}" not found - it may belong to a stale snapshot`);

  const warnings: string[] = [];

  // Constraint 5: the target may already be driven by a different macro.
  const targetContainer = child(targetEl, 'Timeable') ?? targetEl;
  const existingOnTarget = child(targetContainer, 'KeyMidi');
  if (existingOnTarget) {
    const previousMacro = Number(childValue(existingOnTarget, 'NoteOrController'));
    if (previousMacro === macroIndex) return ok(); // already bound to this exact macro, nothing to do
    warnings.push(`cleared macro ${previousMacro + 1}'s binding on this parameter`);
    removeKeyMidi(existingOnTarget);
    permuteVariations(rack, (values) => {
      values[previousMacro] = UNSET_MACRO_VALUE;
    });
  }

  const keyMidi = createKeyMidi(rack.document, macroIndex);
  insertAfterLomId(targetContainer, keyMidi);

  if (range) {
    let rangeEl = child(targetContainer, 'MidiControllerRange');
    if (!rangeEl) {
      rangeEl = rack.document.createElement('MidiControllerRange');
      targetContainer.insertBefore(rangeEl, keyMidi.nextSibling);
    }
    setChildValue(rangeEl, 'Min', range.min);
    setChildValue(rangeEl, 'Max', range.max);
  }

  return ok(warnings);
}

/**
 * Set the range a macro drives a single parameter over. `min > max` inverts
 * it and Live honours that (SCHEMA.md Q4), so inversion is a swap of the two
 * numbers rather than a separate flag.
 *
 * Values are in the target parameter's own units, not 0..127: the transfer
 * function is `value = min + (macro / 127) * (max - min)`.
 */
export function setBindingRange(
  rack: Rack,
  macroIndex: number,
  targetPath: string,
  range: { min: number; max: number },
): MutationResult {
  assertSlot(macroIndex);
  const keyMidi = findBinding(rack, macroIndex, targetPath);
  if (typeof keyMidi === 'string') return fail(keyMidi);

  const container = keyMidi.parentElement!;
  let rangeEl = child(container, 'MidiControllerRange');
  if (!rangeEl) {
    rangeEl = rack.document.createElement('MidiControllerRange');
    container.insertBefore(rangeEl, keyMidi.nextSibling);
  }
  setChildValue(rangeEl, 'Min', range.min);
  setChildValue(rangeEl, 'Max', range.max);
  return ok();
}

/** Swap Min and Max on one binding, so the macro drives it backwards. */
export function invertBindingRange(rack: Rack, macroIndex: number, targetPath: string): MutationResult {
  assertSlot(macroIndex);
  const keyMidi = findBinding(rack, macroIndex, targetPath);
  if (typeof keyMidi === 'string') return fail(keyMidi);

  const rangeEl = child(keyMidi.parentElement!, 'MidiControllerRange');
  if (!rangeEl) return fail('that binding has no stored range to invert');
  const min = Number(childValue(rangeEl, 'Min') ?? 0);
  const max = Number(childValue(rangeEl, 'Max') ?? 127);
  setChildValue(rangeEl, 'Min', max);
  setChildValue(rangeEl, 'Max', min);
  return ok();
}

/**
 * A plugin binding's `targetPath` addresses the element holding the macro
 * index, not a parameter (SCHEMA.md Q20). Nothing here can edit one: the range
 * lives in a differently shaped element and reads 0..1 rather than the
 * parameter's own units, so writing an Ableton-shaped range into it would
 * produce a file that loads and behaves wrong.
 */
const PLUGIN_INDEX_TAGS = ['MacroControlIndex', 'PowerMacroControlIndex'];

/** The KeyMidi for one macro-to-parameter binding, or the reason there is none. */
function findBinding(rack: Rack, macroIndex: number, targetPath: string): Element | string {
  const targetEl = rack.resolveTarget(targetPath);
  if (!targetEl) return `no parameter at "${targetPath}" - it may belong to a stale snapshot`;
  if (PLUGIN_INDEX_TAGS.includes(targetEl.tagName)) {
    return 'that is a plugin parameter - its range belongs to the plugin, and this tool cannot edit it yet';
  }

  const container = child(targetEl, 'Timeable') ?? targetEl;
  const keyMidi = child(container, 'KeyMidi');
  if (!keyMidi || childValue(keyMidi, 'Channel') !== '16') return 'that parameter is not driven by a macro';
  const owner = Number(childValue(keyMidi, 'NoteOrController'));
  if (owner !== macroIndex) return `that parameter is driven by macro ${owner + 1}, not macro ${macroIndex + 1}`;
  return keyMidi;
}

/** Clears ALL of this macro's bindings, not just one. */
export function unbindMacro(rack: Rack, macroIndex: number): MutationResult {
  assertSlot(macroIndex);
  const keyMidis = rack.collectMacroBindings().get(macroIndex) ?? [];
  const pluginRefs = rack.collectPluginMacroRefs().get(macroIndex) ?? [];
  if (keyMidis.length === 0 && pluginRefs.length === 0) return ok();
  for (const km of keyMidis) removeKeyMidi(km);
  // A plugin binding is cleared by writing -1, not by removing the element:
  // the parameter stays exposed, it just stops being driven (SCHEMA.md Q20).
  for (const el of pluginRefs) el.setAttribute('Value', '-1');
  permuteVariations(rack, (values) => {
    values[macroIndex] = UNSET_MACRO_VALUE;
  });
  return ok();
}

export function renameMacro(rack: Rack, macroIndex: number, name: string): MutationResult {
  assertSlot(macroIndex);
  setChildValue(rack.deviceEl, `MacroDisplayNames.${macroIndex}`, name);
  return ok();
}

// --- internals ---

/**
 * Every `<Field>.N` family Live writes once per macro slot (SCHEMA.md Q7),
 * except `MacroControls.N`, whose payload is a `Manual` child rather than a
 * Value attribute and so is swapped separately. All 16 of each exist in every
 * rack regardless of the visible macro count, so a swap can move all of them.
 */
const PER_SLOT_FIELDS = [
  'MacroDisplayNames',
  'MacroDefaults',
  'MacroAnnotations',
  'MacroColor',
  'ForceDisplayGenericValue',
  'ExcludeMacroFromRandomization',
  'ExcludeMacroFromSnapshots',
] as const;

function assertSlot(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= MACRO_SLOTS) {
    throw new RangeError(`macro index ${index} out of range 0..${MACRO_SLOTS - 1}`);
  }
}

function removeKeyMidi(keyMidi: Element): void {
  keyMidi.parentElement?.removeChild(keyMidi);
}

/**
 * Exchange two `<Tag Value="..." />` children. Skips unless BOTH sides exist:
 * with one side missing there is no value to give it in return, and writing
 * the present side's value into both slots (leaving it in place as well) would
 * duplicate rather than swap. Every per-slot macro field is present in all 16
 * copies in a real rack (SCHEMA.md Q7), so this only skips on a malformed file
 * or on the synthetic test fixture, which omits the rarer families.
 */
function swapChildValue(a: Element | null, tagA: string, b: Element | null, tagB?: string): void {
  const bTag = tagB ?? tagA;
  const valueA = a ? childValue(a, tagA) : null;
  const valueB = b ? childValue(b, bTag) : null;
  if (valueA === null || valueB === null) return;
  setChildValue(a!, tagA, valueB);
  setChildValue(b!, bTag, valueA);
}

/** Every `MacroSnapshot`, all 16 `MacroValues.N`/`MacroHasValue.N` read, permuted, written back (SCHEMA.md Q5). */
function permuteVariations(rack: Rack, permute: (values: number[]) => void): void {
  const snapshots = rack.macroSnapshotsEl;
  if (!snapshots) return;
  for (const snap of elementChildren(snapshots)) {
    if (snap.tagName !== 'MacroSnapshot') continue;
    const values = Array.from({ length: MACRO_SLOTS }, (_, i) => Number(childValue(snap, `MacroValues.${i}`) ?? UNSET_MACRO_VALUE));
    permute(values);
    for (let i = 0; i < MACRO_SLOTS; i++) {
      setChildValue(snap, `MacroValues.${i}`, values[i]);
      // HasValue tracks participation directly from the sentinel: a slot
      // holding UNSET is unmapped, any other value means mapped.
      setChildValue(snap, `MacroHasValue.${i}`, values[i] !== UNSET_MACRO_VALUE);
    }
  }
}

function createKeyMidi(doc: Document, macroIndex: number): Element {
  const el = doc.createElement('KeyMidi');
  el.appendChild(createValueEl(doc, 'PersistentKeyString', ''));
  el.appendChild(createValueEl(doc, 'IsNote', false));
  el.appendChild(createValueEl(doc, 'Channel', 16));
  el.appendChild(createValueEl(doc, 'NoteOrController', macroIndex));
  el.appendChild(createValueEl(doc, 'LowerRangeNote', -1));
  el.appendChild(createValueEl(doc, 'UpperRangeNote', -1));
  el.appendChild(createValueEl(doc, 'ControllerMapMode', 0));
  return el;
}

/** Where one inserted (or reused) device landed. */
export interface InsertedDevice {
  /** Path of the device's `AbletonDevicePreset`, relative to the rack (see `Rack.pathOf`). */
  path: string;
  /** True when an existing device at the end of the chain was reused rather than a new one added. */
  reused: boolean;
}

export interface InsertDeviceResult extends MutationResult {
  devices: InsertedDevice[];
}

/**
 * Put `deviceTag` at the end of EVERY chain, reusing one already there.
 *
 * The contract applies in parallel across a rack's chains rather than by
 * wrapping the rack in a parent (doc/PLAN.md 4.3.3): `donors/BS.adg` has a
 * Utility at the end of each of its two chains with one macro driving both.
 * Wrapping is the cheap answer anyone can do by hand in Live, and it costs a
 * menu dive on Push to reach the knobs it hides.
 *
 * A chain that already ends in the device keeps it, so running this twice
 * inserts nothing the second time and the result is the same either way.
 *
 * Device XML is copied from a harvested donor, never generated (Constraint 7).
 * The copy's `Id` is set from its position in the chain, which is what an `Id`
 * means (SCHEMA.md Q16); its interior ids stay at 0, as Live writes them.
 */
export function insertDeviceInEveryChain(rack: Rack, deviceTag: string): InsertDeviceResult {
  const donorXml = DONOR_DEVICES[deviceTag];
  if (!donorXml) {
    return { ok: false, warnings: [`no donor for "${deviceTag}" - save one into packages/adg-codec/donors and run pnpm adg-harvest`], devices: [] };
  }

  const bp = rack.branchPresetsEl;
  const chains = bp ? elementChildren(bp) : [];
  if (chains.length === 0) return { ok: false, warnings: ['rack has no chains'], devices: [] };

  const devices: InsertedDevice[] = [];
  const warnings: string[] = [];

  for (const chain of chains) {
    const presets = child(chain, 'DevicePresets');
    if (!presets) {
      warnings.push(`chain "${childValue(chain, 'Name') ?? ''}" has no DevicePresets and was skipped`);
      continue;
    }

    const existing = elementChildren(presets);
    const last = existing[existing.length - 1];
    if (last && deviceTagOfPreset(last) === deviceTag) {
      devices.push({ path: rack.pathOf(last), reused: true });
      continue;
    }

    const parsed = parseXmlDoc(donorXml).documentElement;
    const copy = rack.document.importNode(parsed, true) as Element;
    presets.appendChild(copy);
    // Id is a position in the sibling list, not a handle (SCHEMA.md Q16), so
    // it is set AFTER appending, from where the element actually landed.
    copy.setAttribute('Id', String(elementChildren(presets).length - 1));
    devices.push({ path: rack.pathOf(copy), reused: false });
  }

  return { ok: true, warnings, devices };
}

/** The device tag an `AbletonDevicePreset` wraps. */
function deviceTagOfPreset(preset: Element): string | null {
  return child(preset, 'Device')?.firstElementChild?.tagName ?? null;
}


/**
 * Write one value inside an inserted device, addressed by the chain of tags
 * from the device element down: `['BassMono', 'Manual']` on a `StereoGain`,
 * `['SideChain', 'OnOff', 'Manual']` on a `Gate`.
 *
 * Every element on the way must already exist. A donor carries the device
 * Live wrote, so a tag that is not there is a wrong tag rather than a missing
 * feature, and creating it would produce a file that loads and behaves wrong -
 * the failure mode this codec exists to avoid (Constraint 7).
 */
export function setDeviceValue(
  rack: Rack,
  devicePath: string,
  path: readonly string[],
  value: string | number | boolean,
): MutationResult {
  if (path.length === 0) throw new RangeError('setDeviceValue needs at least one tag');
  const deviceEl = child(rack.resolveTarget(devicePath), 'Device')?.firstElementChild;
  if (!deviceEl) return fail(`no device at "${devicePath}"`);

  let node: Element | null = deviceEl;
  for (const tag of path.slice(0, -1)) {
    node = child(node, tag);
    if (!node) return fail(`${deviceEl.tagName} has no "${path.join('/')}" to set`);
  }
  const leaf = path[path.length - 1];
  if (!child(node, leaf)) return fail(`${deviceEl.tagName} has no "${path.join('/')}" to set`);
  setChildValue(node, leaf, value);
  return ok();
}

/**
 * Take a device out of its chain, `Id`s of the siblings after it renumbered
 * from their new positions (SCHEMA.md Q16).
 *
 * A macro binding lives INSIDE the parameter it drives (SCHEMA.md Q1), so
 * removing a device takes its bindings with it. Any macro left driving
 * nothing at all therefore has to give up its stored variation values as
 * well, exactly as `unbindMacro` does - a value left in a slot that drives
 * nothing is Constraint 4's corruption seen from the other side.
 */
export function removeDevice(rack: Rack, devicePath: string): MutationResult {
  const preset = rack.resolveTarget(devicePath);
  const presets = preset?.parentElement;
  if (!preset || !presets || presets.tagName !== 'DevicePresets') {
    return fail(`no device at "${devicePath}" - it may belong to a stale snapshot`);
  }

  const before = rack.collectMacroBindings();
  presets.removeChild(preset);
  elementChildren(presets).forEach((el, i) => el.setAttribute('Id', String(i)));

  const after = rack.collectMacroBindings();
  for (const macroIndex of before.keys()) {
    if ((after.get(macroIndex) ?? []).length > 0) continue;
    permuteVariations(rack, (values) => {
      values[macroIndex] = UNSET_MACRO_VALUE;
    });
  }
  return ok();
}

/**
 * The inverse of `insertMacroSlots` for ONE slot: unbind it, rotate it out to
 * the end of the bank so everything above it slides down, and clear it.
 *
 * Rotating rather than blanking in place is what keeps the contract's macros
 * leading and contiguous when one option is unticked (doc/PLAN.md 4.3.1), and
 * it reuses `reorderMacro`, so variation values move on the single tested path
 * (Constraint 4).
 *
 * The visible count comes down by exactly ONE, and is allowed to land on an
 * odd number on the way: taking three slots off a bank of twelve has to end at
 * nine before it can be rounded to eight, and rounding at every step would
 * take two off each time and end at six. `applyContract` evens it out when the
 * batch is done, which is the only place that knows the batch is done.
 *
 * Never below what it takes to show every macro that is still mapped - hiding
 * a macro that still drives something is how a rack loses a knob with no
 * explanation (SCHEMA.md Q7).
 */
export function removeMacroSlot(rack: Rack, macroIndex: number): MutationResult {
  assertSlot(macroIndex);
  const warnings = unbindMacro(rack, macroIndex).warnings;
  reorderMacro(rack, macroIndex, MACRO_SLOTS - 1);
  clearMacroSlot(rack, MACRO_SLOTS - 1);
  renumberDefaultNames(rack, macroIndex);

  setMacroCount(rack, Math.max(visibleFloor(rack), rack.macroCount - 1));
  return ok(warnings);
}

/**
 * Round the visible macro count DOWN to even, never hiding a macro that still
 * drives something.
 *
 * The end of a batch. `removeMacroSlot` takes slots off one at a time and lets
 * the count sit on an odd number in between - taking three off a bank of
 * twelve has to pass through nine to reach eight - and an odd
 * `NumVisibleMacroControls` loads and draws the grid wrong (SCHEMA.md Q19). So
 * whoever ends a batch of removals calls this; `applyContract` does it for the
 * batches it runs.
 */
export function evenMacroCount(rack: Rack): MutationResult {
  const count = rack.macroCount;
  return setMacroCount(rack, Math.max(visibleFloor(rack), count - (count % 2)));
}

/**
 * The fewest macros a rack can show without hiding one that still drives
 * something, rounded up to even (SCHEMA.md Q19).
 */
export function visibleFloor(rack: Rack): number {
  const mapped = rack.collectMacroBindings();
  const highest = Math.max(-1, ...Array.from(mapped.keys()).filter((i) => (mapped.get(i) ?? []).length > 0));
  const needed = highest + 1;
  return Math.max(2, needed + (needed % 2));
}

/**
 * Give one macro back to the rack: unbind whatever it drives and put its name,
 * colour and value back to what an untouched slot carries.
 *
 * The slot STAYS where it is - this is the editor's per-knob reset, not
 * `removeMacroSlot`, which is the contract taking a leading slot away and
 * closing the gap behind it.
 */
export function resetMacro(rack: Rack, macroIndex: number): MutationResult {
  assertSlot(macroIndex);
  const warnings = unbindMacro(rack, macroIndex).warnings;
  clearMacroSlot(rack, macroIndex);
  return ok(warnings);
}

/**
 * Put the default names back in step with their slots, from `from` upwards.
 *
 * The rotation that empties a slot carries names down with it, so a bank that
 * had `Macro 14`, `Macro 15`, `Macro 16` sitting empty at the top ends up
 * reading `Macro 16` three times. Only slots that are empty AND still carry a
 * default name are touched: a name somebody typed is theirs, wherever it
 * lands.
 */
function renumberDefaultNames(rack: Rack, from: number): void {
  const bindings = rack.collectMacroBindings();
  for (let i = from; i < MACRO_SLOTS; i++) {
    if ((bindings.get(i) ?? []).length > 0) continue;
    const name = childValue(rack.deviceEl, `MacroDisplayNames.${i}`) ?? '';
    if (/^Macro \d+$/.test(name)) setChildValue(rack.deviceEl, `MacroDisplayNames.${i}`, `Macro ${i + 1}`);
  }
}

/** Write the untouched-slot defaults over one slot. Does NOT unbind: callers do that first, deliberately. */
function clearMacroSlot(rack: Rack, macroIndex: number): void {
  const device = rack.deviceEl;
  for (const field of PER_SLOT_FIELDS) {
    const el = child(device, `${field}.${macroIndex}`);
    if (el) el.setAttribute('Value', MACRO_DEFAULTS[field] ?? '');
  }
  setChildValue(device, `MacroDisplayNames.${macroIndex}`, `Macro ${macroIndex + 1}`);
  const controls = child(device, `MacroControls.${macroIndex}`);
  if (controls) setChildValue(controls, 'Manual', 0);
}

/**
 * What an untouched macro slot carries in a rack Live wrote, read off the
 * empty slots of `donors/BS.adg` (macros 10 to 16). `MacroDisplayNames` is
 * not here because its default is the slot's own number.
 */
const MACRO_DEFAULTS: Record<string, string> = {
  MacroDefaults: '0',
  MacroAnnotations: '',
  MacroColor: '-1',
  ForceDisplayGenericValue: 'false',
  ExcludeMacroFromRandomization: 'false',
  ExcludeMacroFromSnapshots: 'false',
};

/**
 * Give every chain an equal slice of the chain selector's 0..127, so the
 * selector actually selects one chain at a time (SCHEMA.md Q24).
 *
 * A chain selector macro on a rack whose chains all span the full range moves
 * a control that changes nothing: every chain stays active at every position.
 * `donors/KD.adg`'s Kick rack is the worked example - eight chains, sixteen
 * wide each, crossfade edges flush with the range so there is no blend.
 *
 * Leaves a rack that ALREADY partitions its range alone. A layered rack whose
 * chains deliberately overlap is somebody's instrument, not a mistake to
 * correct.
 */
export function distributeChainSelector(rack: Rack): MutationResult {
  const bp = rack.branchPresetsEl;
  const chains = bp ? elementChildren(bp) : [];
  if (chains.length < 2) return fail('a rack with one chain has nothing to select between');

  if (alreadyDistributed(chains)) return ok(['the chains already split the selector range, so they were left alone']);

  const width = 128 / chains.length;
  chains.forEach((chain, i) => {
    const min = Math.round(i * width);
    const max = (i === chains.length - 1 ? 128 : Math.round((i + 1) * width)) - 1;
    let range = child(chain, 'BranchSelectorRange');
    if (!range) {
      range = rack.document.createElement('BranchSelectorRange');
      // Before ZoneSettings, which is where Live writes it. Order is not known
      // to matter, and matching what Live writes costs nothing.
      chain.insertBefore(range, child(chain, 'ZoneSettings'));
    }
    setChildValue(range, 'Min', min);
    setChildValue(range, 'Max', max);
    // Crossfade edges flush with the range: no blend between chains, which is
    // what a selector wants (a blend is a layer).
    setChildValue(range, 'CrossfadeMin', min);
    setChildValue(range, 'CrossfadeMax', max);
  });
  return ok();
}

/** True when the chains hold different selector ranges already - somebody set them, by hand or by us. */
function alreadyDistributed(chains: readonly Element[]): boolean {
  const seen = new Set<string>();
  for (const chain of chains) {
    const range = child(chain, 'BranchSelectorRange');
    if (!range) return false;
    seen.add(`${childValue(range, 'Min')}:${childValue(range, 'Max')}`);
  }
  return seen.size === chains.length;
}

/**
 * Give every macro that only drives THIS chain the chain's own colour.
 *
 * Colour is how a rack of racks stays readable: colour the Rumble pad brown
 * and the knobs that move Rumble should be brown too, or the colour says
 * nothing once the knobs are in one bank at the top. Live does not do this;
 * it is the same argument the contract makes for naming.
 *
 * Only macros whose bindings ALL land inside the chain are touched. One that
 * also drives something elsewhere belongs to no single chain - that is what a
 * macro across chains IS - and recolouring it would claim otherwise.
 */
export function colorChainMacros(rack: Rack, chainPath: string, colorIndex: number): MutationResult {
  const chain = rack.resolveTarget(chainPath);
  if (!chain) return fail(`no chain at "${chainPath}" - it may belong to a stale snapshot`);

  const bindings = rack.collectMacroBindings();
  for (const [macroIndex, keyMidis] of bindings) {
    if (keyMidis.length === 0) continue;
    if (!keyMidis.every((km) => chain.contains(rack.targetParameterOf(km)))) continue;
    setMacroColor(rack, macroIndex, colorIndex);
  }
  return ok();
}
