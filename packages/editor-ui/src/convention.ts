import type { ContractDevice } from '@rackutils/adg-codec';
import { CONTRACT_OPTIONS, optionSpec } from './contractOptions';

/**
 * The convention: which options are on, what they are called, what colour they
 * are, and the code every one of them carries (doc/PLAN.md 4.3.7).
 *
 * Kept so the second rack comes out like the first. It survives a reload
 * because it is in `localStorage`, and that is as far as it goes:
 *
 * - `localStorage` is per BROWSER and per ORIGIN, so a convention does not
 *   follow you to another machine;
 * - **the bundled device is a different origin from the website** (4.7), so it
 *   does not follow you in there either.
 *
 * Hence export/import, built with the storage rather than after it: one JSON
 * file answers both, and it is the only way a convention travels at all.
 */
export interface ConventionOption {
  on: boolean;
  namePattern: string;
  colorIndex?: number;
  /** Per-option checkboxes, by `ContractSetting.id`. */
  settings: Record<string, boolean>;
}

export interface Convention {
  /** The code. Reaches the rack's name, every contract macro, every inserted device and the output filename. */
  name: string;
  options: Record<string, ConventionOption>;
}

const STORAGE_KEY = 'rackutils.convention.v1';
/** Bumped only if the shape changes incompatibly; an unknown version is ignored rather than half-read. */
const FORMAT = 1;

export function defaultConvention(name = ''): Convention {
  const options: Record<string, ConventionOption> = {};
  for (const spec of CONTRACT_OPTIONS) {
    options[spec.id] = {
      on: false,
      namePattern: spec.device.namePattern,
      colorIndex: spec.device.colorIndex,
      settings: Object.fromEntries((spec.settings ?? []).map((s) => [s.id, false])),
    };
  }
  return { name, options };
}

/**
 * Read the stored convention, merged over the defaults.
 *
 * Merged rather than trusted: a stored convention was written by an older
 * build that may not have had every option, and a missing entry must read as
 * "off" rather than crash the strip.
 */
export function loadConvention(fallbackName = ''): Convention {
  const base = defaultConvention(fallbackName);
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode, or storage disabled. The strip still works, it just
    // forgets - which is better than not rendering.
    return base;
  }
  if (!raw) return base;
  try {
    return merge(base, JSON.parse(raw));
  } catch {
    return base;
  }
}

export function saveConvention(convention: Convention): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ format: FORMAT, ...convention }));
  } catch {
    // Nothing to do and nothing worth interrupting the user for.
  }
}

/** The convention as a file, so it can travel between machines and into the device. */
export function exportConvention(convention: Convention): string {
  return JSON.stringify({ format: FORMAT, ...convention }, null, 2);
}

export function importConvention(json: string, fallbackName = ''): Convention {
  return merge(defaultConvention(fallbackName), JSON.parse(json));
}

function merge(base: Convention, stored: unknown): Convention {
  if (!stored || typeof stored !== 'object') return base;
  const data = stored as Partial<Convention> & { format?: number };
  if (data.format !== undefined && data.format !== FORMAT) return base;

  const options = { ...base.options };
  for (const [id, value] of Object.entries(data.options ?? {})) {
    // An option this build does not have is dropped, not carried: the strip
    // can only show what it knows how to apply.
    if (!optionSpec(id)) continue;
    options[id] = {
      on: Boolean(value?.on),
      namePattern: typeof value?.namePattern === 'string' ? value.namePattern : options[id].namePattern,
      colorIndex: typeof value?.colorIndex === 'number' ? value.colorIndex : options[id].colorIndex,
      settings: { ...options[id].settings, ...(value?.settings ?? {}) },
    };
  }
  return { name: typeof data.name === 'string' ? data.name : base.name, options };
}

/**
 * One option as the codec wants it: the spec's device, with the convention's
 * name, colour and settings written over it.
 */
export function deviceFor(id: string, convention: Convention): ContractDevice | null {
  const spec = optionSpec(id);
  if (!spec) return null;
  const chosen = convention.options[id];
  const values = (spec.settings ?? []).flatMap((setting) => (chosen?.settings[setting.id] ? setting.on : setting.off));
  return {
    ...spec.device,
    namePattern: chosen?.namePattern || spec.device.namePattern,
    colorIndex: chosen?.colorIndex ?? spec.device.colorIndex,
    ...(values.length > 0 ? { values } : {}),
  };
}

/** Every ticked option, in the strip's own order - which is the order their macros land in. */
export function tickedDevices(convention: Convention): ContractDevice[] {
  return CONTRACT_OPTIONS.filter((spec) => convention.options[spec.id]?.on)
    .map((spec) => deviceFor(spec.id, convention))
    .filter((d): d is ContractDevice => d !== null);
}
