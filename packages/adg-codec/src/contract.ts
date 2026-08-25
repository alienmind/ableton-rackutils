/**
 * Applying a contract to a rack: the pieces of a convention a producer wants
 * every one of their racks to present the same way (doc/PLAN.md 4.3).
 *
 * One option means one device at the end of EVERY chain, driven by ONE macro
 * in a leading slot, named from a pattern and coloured. That parallel shape is
 * the point: `donors/BS.adg` has a Utility at the end of both its chains with
 * a single `BS GAIN` macro moving both, and reproducing it by hand is the
 * tedious part this replaces. Wrapping the rack in a parent instead is the
 * cheap answer anyone can do in Live in seconds, and it costs a menu dive on
 * Push to reach the knobs it hides.
 */
import { child, childValue } from './dom';
import { MACRO_SLOTS, Rack, type ParamRef } from './model';
import {
  bindParameter,
  insertDeviceInEveryChain,
  insertMacroSlots,
  renameMacro,
  setMacroColor,
  type MutationResult,
} from './mutate';

export interface ContractDevice {
  /** Harvested donor tag, e.g. `StereoGain` for Utility. */
  deviceTag: string;
  /** The device parameter the macro drives, e.g. `Gain`. A direct child of the device element. */
  parameter: string;
  /** Macro name. `{name}` is replaced by the rack's name, so `{name} GAIN` becomes `BS GAIN`. */
  namePattern: string;
  /** `MacroColor.N`, a palette index (SCHEMA.md Q13). Omit to leave the slot's colour alone. */
  colorIndex?: number;
}

export interface ContractResult extends MutationResult {
  /** Macro slot each option ended up on, in the order given. */
  slots: number[];
}

/** Fill `{name}` from the rack's own name, which the UI sets from the track code. */
export function macroNameFor(pattern: string, rackName: string): string {
  return pattern.replace(/\{name\}/g, rackName);
}

/**
 * Put every option in `devices` on this rack, in order, occupying the leading
 * macro slots.
 *
 * Leading slots are what make the convention worth having: whichever rack you
 * open, the first knobs are the ones you put there (doc/PLAN.md 4.3.1).
 *
 * Safe to re-run. An option whose macro already drives the right parameter on
 * every chain is left where it is and only renamed and recoloured, so ticking
 * an option that is already satisfied does not shift the bank again.
 */
export function applyContract(rack: Rack, devices: readonly ContractDevice[]): ContractResult {
  const warnings: string[] = [];
  const slots: number[] = [];

  // Split into what is already on the rack and what has to be made room for,
  // before touching anything: the shift has to be sized once.
  const existing = new Map<number, number>(); // index into devices -> macro slot
  devices.forEach((device, i) => {
    const slot = findSatisfiedSlot(rack, device);
    if (slot !== null) existing.set(i, slot);
  });

  const toAdd = devices.length - existing.size;
  if (toAdd > 0) {
    const shift = insertMacroSlots(rack, toAdd);
    if (!shift.ok) return { ok: false, warnings: shift.warnings, slots: [] };
    // Slots recorded before the shift moved by exactly that much.
    for (const [i, slot] of existing) existing.set(i, slot + toAdd);
  }

  let nextFreeSlot = 0;
  for (const [i, device] of devices.entries()) {
    const slot = existing.get(i) ?? nextFreeSlot++;
    slots.push(slot);

    if (!existing.has(i)) {
      const inserted = insertDeviceInEveryChain(rack, device.deviceTag);
      if (!inserted.ok) return { ok: false, warnings: [...warnings, ...inserted.warnings], slots: [] };
      warnings.push(...inserted.warnings);

      for (const { path } of inserted.devices) {
        const param = parameterRef(rack, path, device.parameter);
        if (!param) {
          warnings.push(`${device.deviceTag} has no "${device.parameter}" parameter to bind`);
          continue;
        }
        const bound = bindParameter(rack, slot, param);
        warnings.push(...bound.warnings);
      }
    }

    renameMacro(rack, slot, macroNameFor(device.namePattern, rack.name));
    if (device.colorIndex !== undefined) setMacroColor(rack, slot, device.colorIndex);
  }

  return { ok: true, warnings, slots };
}

/**
 * The slot already doing this option's job, or null.
 *
 * "Doing the job" means one macro drives that parameter on a device of that
 * type in every chain. A macro driving it on only some chains is not
 * satisfied: the contract's whole claim is that the knob moves all of them.
 */
function findSatisfiedSlot(rack: Rack, device: ContractDevice): number | null {
  const chainCount = rack.chains.length;
  if (chainCount === 0) return null;

  for (let slot = 0; slot < MACRO_SLOTS; slot++) {
    const bindings = rack.macros[slot].bindings;
    if (bindings.length !== chainCount) continue;
    const allMatch = bindings.every((b) => {
      const el = rack.resolveTarget(b.targetPath);
      return el?.tagName === device.parameter && el.parentElement?.tagName === device.deviceTag;
    });
    if (allMatch) return slot;
  }
  return null;
}

/** A `ParamRef` for one named parameter of an inserted device, addressed from its `AbletonDevicePreset`. */
function parameterRef(rack: Rack, devicePath: string, parameter: string): ParamRef | null {
  const preset = rack.resolveTarget(devicePath);
  const deviceEl = child(preset, 'Device')?.firstElementChild;
  const param = child(deviceEl, parameter);
  if (!param) return null;
  return {
    path: rack.pathOf(param),
    name: childValue(param, 'Name') ?? parameter,
    boundToMacro: null,
  };
}
