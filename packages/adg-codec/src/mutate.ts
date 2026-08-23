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
 * Move the binding at `from` to `to`. If `to` is already mapped its binding
 * is cleared and reported in warnings. Not a node move (SCHEMA.md Q3): the
 * KeyMidi stays on the same target parameter, only its NoteOrController
 * value changes.
 */
export function moveMapping(rack: Rack, from: number, to: number): MutationResult {
  if (from === to) return ok();
  assertSlot(from);
  assertSlot(to);
  const bindings = rack.collectMacroBindings();
  const fromKeyMidi = bindings.get(from);
  if (!fromKeyMidi) return fail(`macro ${from + 1} has no mapping to move`);

  const warnings: string[] = [];
  const toKeyMidi = bindings.get(to);
  if (toKeyMidi) {
    warnings.push(`cleared existing binding on macro ${to + 1}`);
    removeKeyMidi(toKeyMidi);
  }
  setChildValue(fromKeyMidi, 'NoteOrController', to);

  permuteVariations(rack, (values) => {
    values[to] = values[from];
    values[from] = UNSET_MACRO_VALUE;
  });
  return ok(warnings);
}

/** Exchange bindings, names, stored values, and all variation values between two slots. */
export function swapMacros(rack: Rack, a: number, b: number): MutationResult {
  if (a === b) return ok();
  assertSlot(a);
  assertSlot(b);

  const bindings = rack.collectMacroBindings();
  const aKeyMidi = bindings.get(a);
  const bKeyMidi = bindings.get(b);
  if (aKeyMidi) setChildValue(aKeyMidi, 'NoteOrController', b);
  if (bKeyMidi) setChildValue(bKeyMidi, 'NoteOrController', a);

  const device = rack.deviceEl;
  swapChildValue(device, `MacroDisplayNames.${a}`, device, `MacroDisplayNames.${b}`);
  swapChildValue(child(device, `MacroControls.${a}`), 'Manual', child(device, `MacroControls.${b}`), 'Manual');

  permuteVariations(rack, (values) => {
    [values[a], values[b]] = [values[b], values[a]];
  });
  return ok();
}

/**
 * Bind a parameter to a macro. Clears any macro already driving that
 * parameter (Constraint 5: a parameter can only be driven by one macro) and
 * any binding already on this macro slot.
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
  const bindings = rack.collectMacroBindings();

  // Constraint 5: the target may already be driven by a different macro.
  const targetContainer = child(targetEl, 'Timeable') ?? targetEl;
  const existingOnTarget = child(targetContainer, 'KeyMidi');
  if (existingOnTarget) {
    const previousMacro = Number(childValue(existingOnTarget, 'NoteOrController'));
    warnings.push(`cleared macro ${previousMacro + 1}'s binding on this parameter`);
    removeKeyMidi(existingOnTarget);
    permuteVariations(rack, (values) => {
      values[previousMacro] = UNSET_MACRO_VALUE;
    });
  }

  // This macro slot may already drive something else.
  const existingOnMacro = bindings.get(macroIndex);
  if (existingOnMacro && existingOnMacro !== existingOnTarget) {
    warnings.push(`cleared macro ${macroIndex + 1}'s previous binding`);
    removeKeyMidi(existingOnMacro);
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

export function unbindMacro(rack: Rack, macroIndex: number): MutationResult {
  assertSlot(macroIndex);
  const keyMidi = rack.collectMacroBindings().get(macroIndex);
  if (!keyMidi) return ok();
  removeKeyMidi(keyMidi);
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
