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
import { child, childValue, createValueEl, elementChildren, insertAfterLomId, setChildValue } from './dom';
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
  const fromKeyMidis = bindings.get(from) ?? [];
  if (fromKeyMidis.length === 0) return fail(`macro ${from + 1} has no mapping to move`);

  const warnings: string[] = [];
  const toKeyMidis = bindings.get(to) ?? [];
  if (toKeyMidis.length > 0) {
    warnings.push(`cleared ${toKeyMidis.length} existing binding${toKeyMidis.length > 1 ? 's' : ''} on macro ${to + 1}`);
    for (const km of toKeyMidis) removeKeyMidi(km);
  }
  for (const km of fromKeyMidis) setChildValue(km, 'NoteOrController', to);

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

/** Clears ALL of this macro's bindings, not just one. */
export function unbindMacro(rack: Rack, macroIndex: number): MutationResult {
  assertSlot(macroIndex);
  const keyMidis = rack.collectMacroBindings().get(macroIndex) ?? [];
  if (keyMidis.length === 0) return ok();
  for (const km of keyMidis) removeKeyMidi(km);
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
