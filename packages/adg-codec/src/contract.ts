/**
 * Applying a contract to a rack: the pieces of a convention a producer wants
 * every one of their racks to present the same way (doc/PLAN.md 4.3).
 *
 * One option usually means one device at the end of EVERY chain, driven by ONE
 * macro in a leading slot, named from a pattern and coloured. That parallel
 * shape is the point: `donors/BS.adg` has a Utility at the end of both its
 * chains with a single `BS GAIN` macro moving both, and reproducing it by hand
 * is the tedious part this replaces. Wrapping the rack in a parent instead is
 * the cheap answer anyone can do in Live in seconds, and it costs a menu dive
 * on Push to reach the knobs it hides.
 *
 * Two options are not that shape and both are real:
 *
 * - one that adds a device and binds NOTHING (the Compressor, 4.3.2), since
 *   not every piece of a convention is a knob;
 * - one that binds a parameter of the RACK ITSELF and adds no device at all -
 *   the chain selector, which `donors/KD.adg` carries by hand as `KICK SEL`.
 */
import { child, childValue, setChildValue } from './dom';
import { MACRO_SLOTS, Rack, type Macro, type ParamRef } from './model';
import {
  bindParameter,
  distributeChainSelector,
  renameRack,
  insertDeviceInEveryChain,
  insertMacroSlots,
  removeDevice,
  removeMacroSlot,
  renameMacro,
  reorderMacro,
  setDeviceValue,
  setMacroColor,
  setMacroCount,
  type InsertedDevice,
  type MutationResult,
} from './mutate';

/**
 * One value the option writes into its device, addressed by the chain of tags
 * from the device element down: `['BassMono', 'Manual']` on a `StereoGain`.
 *
 * This is how an option carries a setting that is not a macro - Utility's bass
 * mono, the Gate's sidechain switch. The switch is all a preset can carry: a
 * sidechain SOURCE names a track and a preset has no tracks, so Live drops it
 * on save (SCHEMA.md Q14).
 */
export interface DeviceValue {
  path: readonly string[];
  value: string | number | boolean;
}

export interface ContractDevice {
  /**
   * Harvested donor tag, e.g. `StereoGain` for Utility.
   *
   * OMIT IT for an option that binds a parameter of the rack itself, like
   * `ChainSelector`. There is no device to add: the parameter is already
   * there, on the rack device (SCHEMA.md Q15).
   */
  deviceTag?: string;
  /**
   * The parameter the macro drives, e.g. `Gain`. A direct child of the device
   * element, or of the rack device when `deviceTag` is omitted.
   *
   * OMIT IT for an option that only guarantees the device is there. Not every
   * piece of a convention is a knob: the Compressor option in doc/PLAN.md
   * 4.3.2 has no macro at all, and forcing one would spend a leading slot on a
   * control nobody asked for.
   */
  parameter?: string;
  /** Macro name. `{name}` is replaced by the contract's name, so `{name} GAIN` becomes `BS GAIN`. */
  namePattern: string;
  /**
   * Name written onto the inserted device itself, in every chain. Defaults to
   * `namePattern`, so the device Live shows in the chain reads `BS GAIN` like
   * the knob driving it. Not applied to a device that was already there.
   */
  deviceNamePattern?: string;
  /** `MacroColor.N`, a palette index (SCHEMA.md Q13). Omit to leave the slot's colour alone. */
  colorIndex?: number;
  /**
   * Device path of a NESTED rack this feature applies inside of, with the
   * macro that drives it staying on THIS rack. Two links rather than one:
   * this rack's macro drives the nested rack's macro (SCHEMA.md Q22), and that
   * macro drives `parameter` on the nested rack itself.
   *
   * The case is a drum rack. Its pads are chains, but they answer to notes -
   * a chain selector on the rack itself is a control that loads and does
   * nothing. What a drum rack actually wants is the shape `donors/KD.adg`
   * carries by hand: the Kick pad holds a rack of eight kicks, one of ITS
   * macros drives ITS chain selector, and the drum rack's own macro drives
   * that. Only meaningful with a `parameter` and no `deviceTag`.
   */
  targetRack?: string;
  /** What `{target}` expands to in the patterns - the pad or chain the nested rack sits in. */
  targetName?: string;
  /**
   * Values written into every instance of the device, inserted or reused. A
   * reused device keeps its NAME - renaming someone else's device is not this
   * tool's job - but a ticked setting is a statement about what the rack does,
   * so it is written wherever the option applies.
   */
  values?: readonly DeviceValue[];
}

export interface ContractOptions {
  /**
   * What `{name}` expands to, and what the rack is renamed to.
   *
   * The rack's own name by default, which is usually WRONG for a macro label:
   * a rack called "AlienMind Bass" produces "AlienMind Bass GAIN", 21
   * characters, and Live wraps a label that long onto a second line, making
   * every macro cell taller and the rack taller with it (SCHEMA.md Q19). Pass
   * the short track code the convention is built on - "BS" - which is what the
   * UI's rack name field is for (doc/PLAN.md 4.3.1).
   *
   * One code, everywhere: the rack, its macros and the devices the contract
   * adds all read `BS`, so a rack is identifiable from any one of them.
   */
  name?: string;
  /** Set false to leave the rack's own name alone and only use `name` for labels. */
  renameTheRack?: boolean;
}

export interface ContractResult extends MutationResult {
  /** Macro slot each option ended up on, in the order given. `-1` for an option that binds nothing. */
  slots: number[];
}

/** How far along the rack already is on one option. */
export type ContractState = 'absent' | 'partial' | 'satisfied';

export interface ContractStatus {
  /** The macro doing this option's job, or null - always null for an option that binds nothing. */
  slot: number | null;
  /**
   * `absent` - nothing of this option is here. `satisfied` - one macro drives
   * it on every chain (or, with no macro, the device ends every chain).
   * `partial` - some chains have it and some do not, which is its own state:
   * the contract inserts into the chain that lacks it and binds both
   * (doc/PLAN.md 4.3.3).
   */
  state: ContractState;
  /** Chains this option's device already ends. Zero for an option with no device. */
  chainsCovered: number;
  chainCount: number;
}

/**
 * Fill a label pattern: `{name}` from the rack's name, `{target}` from the pad
 * or chain a targeted feature applies to.
 */
export function macroNameFor(pattern: string, rackName: string, targetName = ''): string {
  return pattern.replace(/\{name\}/g, rackName).replace(/\{target\}/g, targetName);
}

/**
 * What the rack already does about each option, without changing anything.
 *
 * The UI needs this to show an option as satisfied, partial or absent before
 * the user commits to it (doc/PLAN.md 4.3.1). `applyContract` answers the same
 * question by the same rules, so what the strip shows and what ticking it does
 * cannot drift apart.
 */
export function inspectContract(rack: Rack, devices: readonly ContractDevice[]): ContractStatus[] {
  const chainCount = rack.chains.length;
  // Read once. `rack.macros` recomputes every slot and rescans the document
  // for KeyMidi elements, so reading it per slot per option turned the strip
  // into seconds of work on every render.
  const macros = rack.macros;
  return devices.map((device) => {
    const chainsCovered = device.deviceTag ? chainsEndingIn(rack, device.deviceTag).length : 0;
    const satisfied = findSatisfiedSlot(rack, device, macros);
    if (satisfied !== null) return { slot: satisfied, state: 'satisfied', chainsCovered, chainCount };

    // An option with no macro is satisfied by its device alone.
    if (device.parameter === undefined && chainCount > 0 && chainsCovered === chainCount) {
      return { slot: null, state: 'satisfied', chainsCovered, chainCount };
    }

    const partial = findPartialSlot(rack, device, macros);
    const state: ContractState = partial !== null || chainsCovered > 0 ? 'partial' : 'absent';
    return { slot: partial, state, chainsCovered, chainCount };
  });
}

/**
 * Put every option in `devices` on this rack, in order, occupying the leading
 * macro slots.
 *
 * Leading slots are what make the convention worth having: whichever rack you
 * open, the first knobs are the ones you put there (doc/PLAN.md 4.3.1). Their
 * order among themselves is the order of `devices`, not the order the user
 * happened to tick them in, so the same convention lands the same way on every
 * rack. An option the rack already satisfies is moved into its place rather
 * than duplicated.
 *
 * Safe to re-run. An option whose macro already drives the right parameter on
 * every chain is left where it is and only renamed and recoloured, so ticking
 * an option that is already satisfied does not shift the bank again.
 *
 * Pass `options.name` unless the rack is already named the short way. Macro
 * labels are read at a glance on a small knob, and a long one wraps.
 */
export function applyContract(
  rack: Rack,
  devices: readonly ContractDevice[],
  options: ContractOptions = {},
): ContractResult {
  const warnings: string[] = [];
  const name = options.name ?? rack.name;
  const slots: number[] = [];

  if (options.name !== undefined && options.renameTheRack !== false) renameRack(rack, options.name);

  // Split into what is already on the rack and what has to be made room for,
  // before touching anything: the shift has to be sized once.
  const existing = new Map<number, number>(); // index into devices -> macro slot
  const before = rack.macros; // read once: see inspectContract
  devices.forEach((device, i) => {
    const slot = findSatisfiedSlot(rack, device, before);
    if (slot !== null) existing.set(i, slot);
  });

  const toAdd = devices.filter((d, i) => d.parameter !== undefined && !existing.has(i)).length;
  if (toAdd > 0) {
    const shift = insertMacroSlots(rack, toAdd);
    if (!shift.ok) return { ok: false, warnings: shift.warnings, slots: [] };
    // Slots recorded before the shift moved by exactly that much.
    for (const [i, slot] of existing) existing.set(i, slot + toAdd);
  }

  // One insertion per device tag per run. `insertDeviceInEveryChain` reuses a
  // device a chain already ends in, which covers consecutive options and not
  // separated ones: EQ Three's three band options share ONE device per chain
  // (doc/PLAN.md 4.3.2), and an option inserted between them would otherwise
  // leave the third band appending a second EQ.
  const inserted = new Map<string, InsertedDevice[]>();
  let nextFreeSlot = 0;

  for (const [i, device] of devices.entries()) {
    const slot = existing.get(i) ?? (device.parameter === undefined ? -1 : nextFreeSlot++);
    slots.push(slot);

    if (!existing.has(i)) {
      const landed = placeOption(rack, device, name, slot, inserted, warnings);
      if (!landed.ok) return { ok: false, warnings: [...warnings, ...landed.warnings], slots: [] };
    }

    for (const value of device.values ?? []) {
      for (const path of instancePaths(rack, device, existing.has(i) ? slot : null, inserted)) {
        warnings.push(...setDeviceValue(rack, path, value.path, value.value).warnings);
      }
    }

    if (slot >= 0) {
      renameMacro(rack, slot, macroNameFor(device.namePattern, name, device.targetName));
      if (device.colorIndex !== undefined) setMacroColor(rack, slot, device.colorIndex);
    }
  }

  orderContractMacros(rack, slots);
  return { ok: true, warnings, slots };
}

/**
 * Take one option back off the rack: unbind and remove its macro, and remove
 * the devices the contract itself put there.
 *
 * A device the contract did NOT insert is left alone and reported. The tell is
 * its name: the contract writes `{name} GAIN` onto what it inserts and never
 * renames a device that was already in the chain, so a Utility called anything
 * else is the user's own, and unticking an option is not a licence to delete
 * it.
 */
export function removeContractOption(rack: Rack, device: ContractDevice, options: ContractOptions = {}): ContractResult {
  const name = options.name ?? rack.name;
  const warnings: string[] = [];
  const slot = findSatisfiedSlot(rack, device) ?? findPartialSlot(rack, device);

  if (device.deviceTag) {
    const ours = macroNameFor(device.deviceNamePattern ?? device.namePattern, name, device.targetName);
    const present = candidateDevices(rack, device, slot);
    const mine = present.filter((el) => deviceNameOf(el) === ours);
    const theirs = present.length - mine.length;
    if (theirs > 0) {
      warnings.push(
        `left ${theirs} ${device.deviceTag} the contract did not add - ${theirs > 1 ? 'they were' : 'it was'} already in the rack`,
      );
    }
    // Elements, not paths: removing one device renumbers its own chain, and a
    // path captured beforehand then points at whatever slid into its place.
    for (const el of mine) warnings.push(...removeDevice(rack, rack.pathOf(el)).warnings);
  }

  if (slot !== null) warnings.push(...removeMacroSlot(rack, slot).warnings);
  return { ok: true, warnings, slots: [] };
}

/**
 * Insert this option's device where it belongs and bind its macro.
 *
 * Three shapes go through here: a device plus a macro, a device alone, and a
 * macro on the rack's own parameter with no device at all.
 */
function placeOption(
  rack: Rack,
  device: ContractDevice,
  name: string,
  slot: number,
  inserted: Map<string, InsertedDevice[]>,
  warnings: string[],
): MutationResult {
  if (device.targetRack) return placeInNestedRack(rack, device, name, slot, warnings);

  if (!device.deviceTag) {
    if (device.parameter === undefined) return { ok: false, warnings: ['an option with no device and no parameter does nothing'] };
    const param = rackParameterRef(rack, device.parameter);
    if (!param) return { ok: false, warnings: [`this rack has no "${device.parameter}" of its own to bind`] };
    if (device.parameter === 'ChainSelector') {
      // A selector whose chains all span the full range moves nothing
      // (SCHEMA.md Q24), so the feature carries the ranges with it.
      const spread = distributeChainSelector(rack);
      warnings.push(...spread.warnings);
      if (!spread.ok) return spread;
    }
    warnings.push(...bindParameter(rack, slot, param).warnings);
    return { ok: true, warnings: [] };
  }

  let instances = inserted.get(device.deviceTag);
  if (!instances) {
    const result = insertDeviceInEveryChain(rack, device.deviceTag);
    if (!result.ok) return result;
    warnings.push(...result.warnings);
    instances = result.devices;
    inserted.set(device.deviceTag, instances);

    const deviceName = macroNameFor(device.deviceNamePattern ?? device.namePattern, name, device.targetName);
    for (const { path, reused } of instances) {
      // A device that was already in the chain keeps whatever the user called
      // it. Renaming someone else's device is not this tool's job.
      if (!reused) nameDevice(rack, path, deviceName);
    }
  }

  if (device.parameter !== undefined) {
    for (const { path } of instances) {
      const param = parameterRef(rack, path, device.parameter);
      if (!param) {
        warnings.push(`${device.deviceTag} has no "${device.parameter}" parameter to bind`);
        continue;
      }
      warnings.push(...bindParameter(rack, slot, param).warnings);
    }
  }
  return { ok: true, warnings: [] };
}

/**
 * A feature whose macro lives here and whose parameter lives in a nested rack.
 *
 * Two links, because a rack's macro cannot reach into another rack's
 * parameters (SCHEMA.md Q2): the nested rack gets a macro of its own driving
 * the parameter, and this rack's macro drives THAT macro through a `KeyMidi`
 * on its `MacroControls.N` (Q22). It is what `donors/KD.adg` does by hand, and
 * the only shape that works.
 *
 * An existing inner macro is reused rather than duplicated, which is the same
 * rule the rest of the contract follows: KD's Kick rack already has `KICK SEL`
 * driving its chain selector, so applying this to that pad binds the outer
 * macro to it and stops.
 */
function placeInNestedRack(
  rack: Rack,
  device: ContractDevice,
  name: string,
  slot: number,
  warnings: string[],
): MutationResult {
  const parameter = device.parameter;
  if (parameter === undefined) return { ok: false, warnings: ['a feature inside a nested rack needs a parameter to drive'] };

  const nested = rack.subRack(device.targetRack!);
  if (!nested) return { ok: false, warnings: ['that nested rack is no longer where it was - reload the file'] };
  if (parameter === 'ChainSelector') {
    const spread = distributeChainSelector(nested);
    warnings.push(...spread.warnings.map((w) => `${device.targetName ?? nested.name}: ${w}`));
    if (!spread.ok) return spread;
  }

  const label = macroNameFor(device.namePattern, name, device.targetName);
  const inner = innerMacroFor(nested, parameter);
  if (inner === null) {
    return { ok: false, warnings: [`"${nested.name}" has no free macro to drive its ${parameter} with`] };
  }
  if (!inner.existing) {
    const param = rackParameterRef(nested, parameter);
    if (!param) return { ok: false, warnings: [`"${nested.name}" has no ${parameter} of its own`] };
    warnings.push(...bindParameter(nested, inner.slot, param).warnings);
    renameMacro(nested, inner.slot, label);
    if (device.colorIndex !== undefined) setMacroColor(nested, inner.slot, device.colorIndex);
    // A macro nobody can see is a macro nobody can use: widen the inner bank
    // to reach it, keeping the count even (SCHEMA.md Q19).
    if (nested.macroCount <= inner.slot) setMacroCount(nested, Math.min(MACRO_SLOTS, inner.slot + 1 + ((inner.slot + 1) % 2)));
  }

  const outerTarget = innerMacroRef(rack, nested, inner.slot);
  if (!outerTarget) return { ok: false, warnings: [`could not address macro ${inner.slot + 1} of "${nested.name}"`] };
  warnings.push(...bindParameter(rack, slot, outerTarget).warnings);
  return { ok: true, warnings: [] };
}

/**
 * The nested rack's macro that drives `parameter`, or the first free slot to
 * put one on. Null when every slot is taken - a full inner rack is a refusal,
 * not something to overwrite.
 */
function innerMacroFor(nested: Rack, parameter: string): { slot: number; existing: boolean } | null {
  const macros = nested.macros;
  for (const macro of macros) {
    if (macro.bindings.some((b) => nested.resolveTarget(b.targetPath)?.tagName === parameter)) {
      return { slot: macro.index, existing: true };
    }
  }
  const free = macros.find((m) => m.bindings.length === 0);
  return free ? { slot: free.index, existing: false } : null;
}

/** A `ParamRef` for one macro OF A NESTED RACK, addressed from this rack (SCHEMA.md Q22). */
function innerMacroRef(rack: Rack, nested: Rack, slot: number): ParamRef | null {
  const el = child(nested.deviceEl, `MacroControls.${slot}`);
  if (!el) return null;
  return { path: rack.pathOf(el), name: nested.macros[slot].name, boundToMacro: null };
}

/** Where this option's devices ended up, whether they were just inserted or were already on the rack. */
function instancePaths(
  rack: Rack,
  device: ContractDevice,
  satisfiedSlot: number | null,
  inserted: Map<string, InsertedDevice[]>,
): string[] {
  if (!device.deviceTag) return [];
  if (satisfiedSlot !== null) return boundInstances(rack, device, satisfiedSlot).map((d) => d.path);
  return (inserted.get(device.deviceTag) ?? []).map((d) => d.path);
}

/**
 * Move the contract's macros so they occupy the leading slots in the order the
 * options were given, whatever order the rack had them in.
 *
 * Slot comes from the contract, not from the order the user ticked things -
 * that is the whole of the familiarity claim (doc/PLAN.md 4.3.1). An option
 * the rack already satisfied can sit anywhere, so recognising it is not enough
 * on its own. `reorderMacro` rotates rather than overwrites, so nothing is
 * lost when a rack's own macro is pushed along.
 */
function orderContractMacros(rack: Rack, slots: number[]): void {
  let target = 0;
  for (const [i, slot] of slots.entries()) {
    if (slot < 0) continue;
    if (slot !== target) {
      reorderMacro(rack, slot, target);
      // A rotation moves everything between the two ends by one, the
      // contract's own macros included, so what is still to be placed moves
      // with it.
      for (const [j, other] of slots.entries()) {
        if (j === i || other < 0) continue;
        if (other >= target && other < slot) slots[j] = other + 1;
      }
      slots[i] = target;
    }
    target++;
  }
}

/**
 * The slot already doing this option's job, or null.
 *
 * "Doing the job" means one macro drives that parameter on a device of that
 * type in every chain. A macro driving it on only some chains is not
 * satisfied: the contract's whole claim is that the knob moves all of them.
 * An option on the rack's own parameter has exactly one target, so one binding
 * is the whole job.
 */
function findSatisfiedSlot(rack: Rack, device: ContractDevice, macros: readonly Macro[] = rack.macros): number | null {
  if (device.parameter === undefined) return null;
  const wanted = device.deviceTag && !device.targetRack ? rack.chains.length : 1;
  if (wanted === 0) return null;

  for (let slot = 0; slot < MACRO_SLOTS; slot++) {
    const bindings = macros[slot].bindings;
    if (bindings.length !== wanted) continue;
    if (bindings.every((b) => drivesThisOption(rack, b.targetPath, device))) return slot;
  }
  return null;
}

/** The slot driving this option on SOME chains but not all - partial satisfaction (doc/PLAN.md 4.3.3). */
function findPartialSlot(rack: Rack, device: ContractDevice, macros: readonly Macro[] = rack.macros): number | null {
  if (device.parameter === undefined) return null;
  for (let slot = 0; slot < MACRO_SLOTS; slot++) {
    const bindings = macros[slot].bindings;
    if (bindings.length > 0 && bindings.some((b) => drivesThisOption(rack, b.targetPath, device))) return slot;
  }
  return null;
}

function drivesThisOption(rack: Rack, targetPath: string, device: ContractDevice): boolean {
  const el = rack.resolveTarget(targetPath);
  if (!el) return false;

  // A targeted feature is satisfied by the pair: this macro drives a macro of
  // the nested rack, and that one drives the parameter.
  if (device.targetRack) {
    const nested = rack.subRack(device.targetRack);
    const slot = /^MacroControls\.(\d+)$/.exec(el.tagName);
    if (!nested || !slot || el.parentElement !== nested.deviceEl) return false;
    return nested.macros[Number(slot[1])].bindings.some((b) => nested.resolveTarget(b.targetPath)?.tagName === device.parameter);
  }

  if (el.tagName !== device.parameter) return false;
  // With no device tag the target is the rack's own parameter, which hangs off
  // the rack device itself (SCHEMA.md Q15).
  return el.parentElement?.tagName === (device.deviceTag ?? rack.deviceEl.tagName);
}

/** The `AbletonDevicePreset` of every device this option's macro drives. */
function boundInstances(rack: Rack, device: ContractDevice, slot: number): InsertedDevice[] {
  return rack.macros[slot].bindings
    .filter((b) => drivesThisOption(rack, b.targetPath, device))
    .map((b) => presetOf(rack.resolveTarget(b.targetPath)))
    .filter((el): el is Element => el !== null)
    .map((el) => ({ path: rack.pathOf(el), reused: true }));
}

/** Every device this option would own: the ones its macro drives, plus the ones ending a chain. */
function candidateDevices(rack: Rack, device: ContractDevice, slot: number | null): Element[] {
  const found = new Set<Element>();
  if (slot !== null) {
    for (const instance of boundInstances(rack, device, slot)) {
      const el = rack.resolveTarget(instance.path);
      if (el) found.add(el);
    }
  }
  if (device.deviceTag) for (const el of chainsEndingIn(rack, device.deviceTag)) found.add(el);
  return Array.from(found);
}

/** The last `AbletonDevicePreset` of each chain that wraps `deviceTag` - the shape `insertDeviceInEveryChain` reuses. */
function chainsEndingIn(rack: Rack, deviceTag: string): Element[] {
  const found: Element[] = [];
  for (const chain of rack.chains) {
    const last = chain.devices[chain.devices.length - 1];
    if (!last || last.type !== deviceTag) continue;
    const el = rack.resolveTarget(last.path);
    if (el) found.push(el);
  }
  return found;
}

/** Walk up from a parameter to the `AbletonDevicePreset` wrapping its device. */
function presetOf(param: Element | null): Element | null {
  let node: Element | null = param;
  while (node && node.tagName !== 'AbletonDevicePreset') node = node.parentElement;
  return node;
}

function deviceNameOf(preset: Element): string | null {
  const deviceEl = child(preset, 'Device')?.firstElementChild;
  return deviceEl ? childValue(deviceEl, 'UserName') : null;
}

/** A `ParamRef` for one named parameter of an inserted device, addressed from its `AbletonDevicePreset`. */
function parameterRef(rack: Rack, devicePath: string, parameter: string): ParamRef | null {
  const preset = rack.resolveTarget(devicePath);
  const deviceEl = child(preset, 'Device')?.firstElementChild;
  return refFor(rack, child(deviceEl, parameter), parameter);
}

/** A `ParamRef` for a parameter of the RACK itself, like `ChainSelector` (SCHEMA.md Q15). */
function rackParameterRef(rack: Rack, parameter: string): ParamRef | null {
  return refFor(rack, child(rack.deviceEl, parameter), parameter);
}

function refFor(rack: Rack, param: Element | null, parameter: string): ParamRef | null {
  if (!param) return null;
  return {
    path: rack.pathOf(param),
    name: childValue(param, 'Name') ?? parameter,
    boundToMacro: null,
  };
}

/** Write the device's own title, the one Live shows on it in the chain. */
function nameDevice(rack: Rack, devicePath: string, name: string): void {
  const deviceEl = child(rack.resolveTarget(devicePath), 'Device')?.firstElementChild;
  if (deviceEl) setChildValue(deviceEl, 'UserName', name);
}
