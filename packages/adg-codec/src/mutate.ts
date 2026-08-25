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

  const container = child(targetEl, 'Timeable') ?? targetEl;
  const keyMidi = child(container, 'KeyMidi');
  if (!keyMidi || childValue(keyMidi, 'Channel') !== '16') return fail('that parameter is not driven by a macro');
  const owner = Number(childValue(keyMidi, 'NoteOrController'));
  if (owner !== macroIndex) return fail(`that parameter is driven by macro ${owner + 1}, not macro ${macroIndex + 1}`);

  removeKeyMidi(keyMidi);

  // The macro's variation values only become meaningless once it drives
  // nothing at all. While it still has other targets, its stored per-variation
  // positions are live and clearing them would break every variation.
  const remaining = rack.collectMacroBindings().get(macroIndex) ?? [];
  if (remaining.length === 0) {
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

/** The KeyMidi for one macro-to-parameter binding, or the reason there is none. */
function findBinding(rack: Rack, macroIndex: number, targetPath: string): Element | string {
  const targetEl = rack.resolveTarget(targetPath);
  if (!targetEl) return `no parameter at "${targetPath}" - it may belong to a stale snapshot`;

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

