import type { ContractDevice } from '@rackutils/adg-codec';
import { CONTRACT_OPTIONS, optionSpec } from './contractOptions';

/**
 * Feature templates: a named, ordered set of rack features, kept in the
 * browser so the second rack comes out like the first (doc/PLAN.md 4.3.7).
 *
 * A template is the convention. Its ORDER is part of it - the features take
 * the leading macro slots in the order they are listed, so moving one up moves
 * its knob left on every rack the template is applied to.
 *
 * Storage is `localStorage`, and that is as far as it goes:
 *
 * - it is per BROWSER and per ORIGIN, so templates do not follow you to
 *   another machine;
 * - **the bundled device is a different origin from the website** (4.7), so
 *   they do not follow you in there either.
 *
 * Hence export and import, which is the only way a template travels at all.
 */
export interface Feature {
  /** Instance id. A template can hold the same option twice - one chain selector per drum pad. */
  key: string;
  /** Which `CONTRACT_OPTIONS` entry this is. */
  option: string;
  namePattern: string;
  colorIndex?: number;
  /** Per-option checkboxes, by `ContractSetting.id`. */
  settings: Record<string, boolean>;
  /** Which of a multi-knob feature's bands are on, by `ContractBand.id`. Absent means all of them. */
  bands?: Record<string, boolean>;
  /** Per-band label patterns, by `ContractBand.id`, where they differ from the band's default. */
  bandNames?: Record<string, string>;
  /** Device path of the nested rack this instance applies inside of - a drum pad's rack (SCHEMA.md Q24). */
  targetRack?: string;
  /** The pad or chain that rack sits in, which fills `{target}` in the label. */
  targetName?: string;
}

export interface Template {
  id: string;
  name: string;
  features: Feature[];
}

export interface Library {
  templates: Template[];
  activeId: string;
}

const STORAGE_KEY = 'rackutils.templates.v1';
/** Bumped only if the shape changes incompatibly; an unknown version is ignored rather than half-read. */
const FORMAT = 1;

const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function newTemplate(name = 'My features'): Template {
  return { id: id(), name, features: [] };
}

/** One feature instance from an option's defaults. */
export function newFeature(option: string, patch: Partial<Feature> = {}): Feature | null {
  const spec = optionSpec(option);
  if (!spec) return null;
  return {
    key: id(),
    option,
    namePattern: spec.device.namePattern,
    colorIndex: spec.device.colorIndex,
    settings: Object.fromEntries((spec.settings ?? []).map((s) => [s.id, false])),
    ...(spec.bands ? { bands: Object.fromEntries(spec.bands.map((b) => [b.id, true])) } : {}),
    ...patch,
  };
}

export function emptyLibrary(): Library {
  const first = newTemplate('My features');
  return { templates: [first], activeId: first.id };
}

/**
 * Read the stored library, ignoring anything this build cannot apply.
 *
 * Defensive on purpose: a template was written by an older build that may not
 * have had every option, and an option it does not know is dropped rather than
 * shown as a feature nothing happens for.
 */
export function loadLibrary(): Library {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode, or storage disabled. The strip still works, it just
    // forgets - which is better than not rendering.
    return emptyLibrary();
  }
  if (!raw) return emptyLibrary();
  try {
    const data = JSON.parse(raw);
    if (data?.format !== undefined && data.format !== FORMAT) return emptyLibrary();
    const templates = (Array.isArray(data?.templates) ? data.templates : []).map(readTemplate).filter((t: Template | null) => t !== null);
    if (templates.length === 0) return emptyLibrary();
    const activeId = templates.some((t: Template) => t.id === data?.activeId) ? data.activeId : templates[0].id;
    return { templates, activeId };
  } catch {
    return emptyLibrary();
  }
}

export function saveLibrary(library: Library): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ format: FORMAT, ...library }));
  } catch {
    // Nothing to do, and nothing worth interrupting the user for.
  }
}

/** One template as a file, so it can travel between machines and into the device. */
export function exportTemplate(template: Template): string {
  return JSON.stringify({ format: FORMAT, template }, null, 2);
}

/** A template from a file. Takes a new id, so importing the same file twice gives two templates rather than a collision. */
export function importTemplate(json: string): Template | null {
  const data = JSON.parse(json);
  const template = readTemplate(data?.template ?? data);
  return template ? { ...template, id: id() } : null;
}

function readTemplate(value: unknown): Template | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<Template>;
  if (typeof data.name !== 'string') return null;
  const features = (Array.isArray(data.features) ? data.features : [])
    .filter((f) => optionSpec(f?.option))
    .map((f) => ({
      key: typeof f.key === 'string' ? f.key : id(),
      option: f.option,
      namePattern: typeof f.namePattern === 'string' ? f.namePattern : optionSpec(f.option)!.device.namePattern,
      colorIndex: typeof f.colorIndex === 'number' ? f.colorIndex : optionSpec(f.option)!.device.colorIndex,
      settings: typeof f.settings === 'object' && f.settings !== null ? { ...f.settings } : {},
      ...(typeof f.bands === 'object' && f.bands !== null ? { bands: { ...f.bands } } : {}),
      ...(typeof f.bandNames === 'object' && f.bandNames !== null ? { bandNames: { ...f.bandNames } } : {}),
      ...(typeof f.targetRack === 'string' ? { targetRack: f.targetRack } : {}),
      ...(typeof f.targetName === 'string' ? { targetName: f.targetName } : {}),
    }));
  return { id: typeof data.id === 'string' ? data.id : id(), name: data.name, features };
}

/**
 * One feature as the codec wants it - which is one device per KNOB, not one
 * per feature.
 *
 * EQ Three is the reason: it is one device carrying three band gains, so it is
 * one feature with three knobs, and the codec sees three entries sharing a
 * device tag. `insertDeviceInEveryChain` reuses the EQ the first of them
 * inserted, so a chain still ends up with exactly one.
 *
 * A banded feature with every band switched off keeps the device and drops the
 * knobs, which is the same shape the Compressor has.
 */
export function devicesFor(feature: Feature): ContractDevice[] {
  const spec = optionSpec(feature.option);
  if (!spec) return [];
  const values = (spec.settings ?? []).flatMap((setting) => (feature.settings[setting.id] ? setting.on : setting.off));
  const common = {
    ...spec.device,
    colorIndex: feature.colorIndex ?? spec.device.colorIndex,
    ...(feature.targetRack ? { targetRack: feature.targetRack, targetName: feature.targetName } : {}),
    ...(values.length > 0 ? { values } : {}),
  };

  if (!spec.bands) return [{ ...common, namePattern: feature.namePattern || spec.device.namePattern }];

  const on = spec.bands.filter((band) => bandIsOn(feature, band.id));
  if (on.length === 0) return [{ ...common, parameter: undefined, namePattern: feature.namePattern || spec.device.namePattern }];
  return on.map((band) => ({
    ...common,
    parameter: band.parameter,
    namePattern: feature.bandNames?.[band.id] || band.namePattern,
  }));
}

/** A band is on unless the template says otherwise, so an older template that predates a band still gets it. */
export const bandIsOn = (feature: Feature, bandId: string): boolean => feature.bands?.[bandId] !== false;

/** Every feature of a template, in order - which is the order their macros land in. */
export function devicesOf(template: Template): ContractDevice[] {
  return template.features.flatMap(devicesFor);
}

/** Options that can still be added: everything, minus the ones already in and not repeatable. */
export function availableOptions(template: Template) {
  const used = new Set(template.features.map((f) => f.option));
  return CONTRACT_OPTIONS.filter((spec) => spec.repeatable || !used.has(spec.id));
}
