import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyContract, inspectContract, removeContractOption, type ContractStatus, type Rack } from '@rackutils/adg-codec';
import { ColorPicker } from './ColorPicker';
import { CONTRACT_OPTIONS, optionSpec, type ContractOptionSpec } from './contractOptions';
import { macroColor } from './macroColors';
import { useEditor } from './context';
import {
  deviceFor,
  exportConvention,
  importConvention,
  loadConvention,
  saveConvention,
  tickedDevices,
  type Convention,
} from './convention';

/**
 * Rack features: the contract, as two lists and a settings column above the
 * rack (doc/PLAN.md 4.3.1).
 *
 * Left is what the rack could have, right is what it has. Click on the left to
 * put a feature in - the device is added at the end of every chain (or reused
 * if it is already there), one macro is bound to every instance, named,
 * coloured, and placed in a LEADING slot with the rack's own macros shifted
 * right. The x on a feature takes it back out.
 *
 * The third column belongs to whichever feature is selected, and only one is:
 * its label, its colour, and whatever else it carries (bass mono, a sidechain
 * switch). Everything the strip does, the codec decides:
 *
 * - **Slot comes from the contract, not from click order.** The order is
 *   `CONTRACT_OPTIONS`, on every rack, whatever order they went in.
 * - **A piece already present is DETECTED, not duplicated** - it reads as
 *   being in the rack and stays editable. Partial (in one chain, absent in
 *   another) is its own state, and adding binds both.
 * - **One name, everywhere.** The rack name feeds the rack, every feature's
 *   `{name}`, every device the contract adds, and the saved file.
 */
export interface ContractStripProps {
  rack: Rack;
  /** Save the rack to a file. Optional: the editor does not own the file, its host does. */
  onSave?: () => void;
}

export function ContractStrip({ rack, onSave }: ContractStripProps) {
  const { apply } = useEditor();
  const [convention, setConvention] = useState<Convention>(() => loadConvention(rack.name));
  const [selected, setSelected] = useState<string | null>(null);
  const [picking, setPicking] = useState<DOMRect | null>(null);
  const importer = useRef<HTMLInputElement>(null);

  useEffect(() => saveConvention(convention), [convention]);

  // Memoised on the rack handle: every mutation replaces it, and inspecting
  // reads the whole document.
  const statuses = useMemo(
    () => inspectContract(rack, CONTRACT_OPTIONS.map((spec) => deviceFor(spec.id, convention)!)),
    [rack, convention],
  );
  const statusOf = (id: string) => statuses[CONTRACT_OPTIONS.findIndex((s) => s.id === id)];

  const added = CONTRACT_OPTIONS.filter((spec) => convention.options[spec.id]?.on);
  const available = CONTRACT_OPTIONS.filter((spec) => !convention.options[spec.id]?.on);
  const current = selected ? optionSpec(selected) : null;
  const name = convention.name || rack.name;

  /**
   * Re-apply the WHOLE contract after any change, rather than patching in the
   * one feature that moved.
   *
   * `applyContract` is safe to re-run and decides slots from the option order,
   * so this is what keeps the leading knobs in contract order when a feature
   * goes in after ones below it. Removing takes that one out first, then
   * re-runs the rest, so the survivors close ranks.
   */
  const materialise = useCallback(
    (next: Convention, removedId?: string) => {
      const previous = convention;
      setConvention(next);
      // Put the list back when the codec refuses - a rack with no room for
      // another macro, or one with no chain selector of its own. A feature
      // listed as being in the rack when it is not is the one thing this strip
      // must never show.
      const applied = apply([], (r) => {
        if (removedId) {
          const device = deviceFor(removedId, next);
          if (device) {
            const removed = removeContractOption(r, device, { name: next.name || r.name });
            if (!removed.ok) return removed;
          }
        }
        const devices = tickedDevices(next);
        if (devices.length === 0 && !removedId) return { ok: true, warnings: [] };
        return applyContract(r, devices, { name: next.name || undefined });
      });
      if (!applied) setConvention(previous);
    },
    [apply, convention],
  );

  const add = (id: string) => {
    setSelected(id);
    materialise(withOption(convention, id, { on: true }));
  };

  const remove = (id: string) => {
    if (selected === id) setSelected(null);
    materialise(withOption(convention, id, { on: false }), id);
  };

  const commitName = (next: string) => {
    if (next === convention.name) return;
    materialise({ ...convention, name: next });
  };

  const doImport = async (file: File) => {
    try {
      materialise(importConvention(await file.text(), rack.name));
    } catch {
      // A file that is not a set of features is not worth a dialog: the strip
      // keeps the one it has.
    }
  };

  return (
    <section className="contract-strip">
      <header className="contract-head">
        <h3>Rack features</h3>
        <label className="contract-rack-name">
          Rack name
          <input
            className="contract-code"
            defaultValue={convention.name}
            placeholder={rack.name}
            title="Names the rack, fills {name} in every feature's label, names the devices the contract adds, and names the saved file."
            onBlur={(e) => commitName(e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </label>
        {onSave && (
          <button type="button" className="contract-save" onClick={onSave} title="Save a copy">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5" />
              <path d="M2.5 11.5v2h11v-2" />
            </svg>
            <span className="sr-only">Save a copy</span>
          </button>
        )}
        <div className="contract-io">
          <button type="button" onClick={() => download(exportConvention(convention))} title="Save these features as a file">
            Export
          </button>
          <button type="button" onClick={() => importer.current?.click()} title="Load features from a file">
            Import
          </button>
          <input
            ref={importer}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void doImport(file);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <div className="contract-columns">
        <div className="contract-column">
          <h4>Available</h4>
          <ul className="contract-list">
            {available.map((spec) => (
              <li key={spec.id}>
                <button type="button" className="contract-entry" onClick={() => add(spec.id)} title={stateTitle(statusOf(spec.id))}>
                  <Swatch colorIndex={convention.options[spec.id]?.colorIndex} />
                  <span className="contract-entry-name">{spec.label}</span>
                  {statusOf(spec.id).state !== 'absent' && (
                    <span className="contract-entry-state">{statusOf(spec.id).state === 'satisfied' ? 'in rack' : 'partly'}</span>
                  )}
                </button>
              </li>
            ))}
            {available.length === 0 && <li className="contract-empty">every feature is in</li>}
          </ul>
        </div>

        <div className="contract-column">
          <h4>In this rack</h4>
          <ul className="contract-list">
            {added.map((spec) => {
              const option = convention.options[spec.id];
              const colour = swatchColor(option.colorIndex);
              return (
                <li key={spec.id}>
                  <button
                    type="button"
                    className={`contract-entry filled${selected === spec.id ? ' selected' : ''}`}
                    style={{ background: colour, color: contrastOn(colour) }}
                    onClick={() => setSelected(spec.id)}
                    title={stateTitle(statusOf(spec.id))}
                  >
                    <Swatch colorIndex={option.colorIndex} />
                    <span className="contract-entry-name">{labelOf(spec, option.namePattern, name)}</span>
                  </button>
                  <button
                    type="button"
                    className="contract-remove"
                    onClick={() => remove(spec.id)}
                    title={`Take ${spec.label} back out of the rack`}
                  >
                    x
                  </button>
                </li>
              );
            })}
            {added.length === 0 && <li className="contract-empty">nothing yet - pick one on the left</li>}
          </ul>
        </div>

        <div className="contract-column contract-settings">
          <h4>{current ? current.label : 'Settings'}</h4>
          {!current && <p className="contract-empty">Pick a feature to set its name and colour.</p>}
          {current && (
            <>
              <label className="contract-field">
                {current.device.parameter === undefined ? 'Device name' : 'Macro label'}
                <span className="contract-field-row">
                  <button
                    type="button"
                    className="contract-swatch"
                    style={{ background: swatchColor(convention.options[current.id].colorIndex) }}
                    onClick={(e) => {
                      const anchor = e.currentTarget.getBoundingClientRect();
                      setPicking((p) => (p ? null : anchor));
                    }}
                    title="Colour"
                  >
                    <span className="sr-only">Colour</span>
                  </button>
                  <input
                    className="contract-pattern"
                    key={`${current.id}:${convention.options[current.id].namePattern}`}
                    defaultValue={convention.options[current.id].namePattern}
                    title="{name} becomes the rack name."
                    onBlur={(e) =>
                      materialise(withOption(convention, current.id, { namePattern: e.target.value || current.device.namePattern }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                  />
                </span>
              </label>

              {current.device.parameter !== undefined &&
                isLongLabel(labelOf(current, convention.options[current.id].namePattern, name)) && (
                  <p className="contract-note warn">
                    Live wraps a label this long onto a second line and the whole rack grows with it. Twelve characters fit.
                  </p>
                )}

              {(current.settings ?? []).map((setting) => (
                <label key={setting.id} className="contract-setting">
                  <input
                    type="checkbox"
                    checked={Boolean(convention.options[current.id].settings[setting.id])}
                    onChange={(e) =>
                      materialise(
                        withOption(convention, current.id, {
                          settings: { ...convention.options[current.id].settings, [setting.id]: e.target.checked },
                        }),
                      )
                    }
                  />
                  <span>
                    {setting.label}
                    {setting.note && <em className="contract-note">{setting.note}</em>}
                  </span>
                </label>
              ))}

              {current.note && <p className="contract-note">{current.note}</p>}
              <p className="contract-note">{stateTitle(statusOf(current.id))}.</p>

              {picking && (
                <ColorPicker
                  current={convention.options[current.id].colorIndex ?? -1}
                  anchor={picking}
                  onPick={(colorIndex) => {
                    setPicking(null);
                    materialise(withOption(convention, current.id, { colorIndex }));
                  }}
                  onClose={() => setPicking(null)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** The colour chip a list entry carries, the way an editor shows a colour beside its value. */
function Swatch({ colorIndex }: { colorIndex?: number }) {
  return <span className="contract-chip" style={{ background: swatchColor(colorIndex) }} aria-hidden="true" />;
}

/** A feature with no macro has no colour of its own; it still needs something to draw. */
function swatchColor(colorIndex?: number): string {
  return colorIndex === undefined || colorIndex < 0 ? '#4a4f5c' : macroColor(colorIndex);
}

/**
 * Black or white text over a swatch colour. Live's palette runs from near
 * black to white, so one fixed foreground is unreadable at one end or the
 * other.
 */
function contrastOn(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) return '#f4f5f8';
  const n = parseInt(hex[1], 16);
  // Rec. 601 luma, which is what "does this read as light or dark" wants.
  const luma = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luma > 0.55 ? '#101116' : '#f4f5f8';
}

const labelOf = (spec: ContractOptionSpec, pattern: string, name: string) =>
  (pattern || spec.device.namePattern).replace(/\{name\}/g, name);

/** Twelve fits on a knob, twenty-one wraps and takes the rack's height with it (SCHEMA.md Q19). */
const isLongLabel = (label: string) => label.length > 12;

function withOption(convention: Convention, id: string, patch: Partial<Convention['options'][string]>): Convention {
  return { ...convention, options: { ...convention.options, [id]: { ...convention.options[id], ...patch } } };
}

/**
 * What the rack already does about this feature. Partial is worth its own
 * word: it is the state where the tool is about to ADD something to some
 * chains and reuse what is in the others (doc/PLAN.md 4.3.3).
 */
function stateTitle(status: ContractStatus): string {
  if (status.state === 'satisfied') {
    return status.slot === null ? 'Already at the end of every chain' : `On macro ${status.slot + 1}, driving every chain`;
  }
  if (status.state === 'partial') {
    return `In ${status.chainsCovered} of ${status.chainCount} chains - adding it covers the rest and binds them all to one macro`;
  }
  return 'Not in the rack yet';
}

/** The features as a downloaded file. Nothing leaves the browser: this is a blob URL, not an upload. */
function download(json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rack-features.json';
  a.click();
  URL.revokeObjectURL(url);
}
