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

/** Exchange ALL bindings (in both directions), names, colors, stored values, and all variation values between two slots - a full slot swap, not just what each macro drives. */
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
  swapChildValue(device, `MacroDisplayNames.${a}`, device, `MacroDisplayNames.${b}`);
  swapChildValue(device, `MacroColor.${a}`, device, `MacroColor.${b}`);
  swapChildValue(child(device, `MacroControls.${a}`), 'Manual', child(device, `MacroControls.${b}`), 'Manual');

  permuteVariations(rack, (values) => {
    [values[a], values[b]] = [values[b], values[a]];
  });
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

function assertSlot(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= MACRO_SLOTS) {
    throw new RangeError(`macro index ${index} out of range 0..${MACRO_SLOTS - 1}`);
  }
}

function removeKeyMidi(keyMidi: Element): void {
  keyMidi.parentElement?.removeChild(keyMidi);
}

function swapChildValue(a: Element | null, tagA: string, b: Element | null, tagB?: string): void {
  const bTag = tagB ?? tagA;
  const bothA = a ? childValue(a, tagA) : null;
  const bothB = b ? childValue(b, bTag) : null;
  if (a && bothB !== null) setChildValue(a, tagA, bothB);
  if (b && bothA !== null) setChildValue(b, bTag, bothA);
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
