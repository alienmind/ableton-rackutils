import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyContract, inspectContract, removeContractOption, type ContractStatus, type Rack } from '@rackutils/adg-codec';
import { ColorPicker } from './ColorPicker';
import { optionSpec, type ContractOptionSpec } from './contractOptions';
import { macroColor } from './macroColors';
import { useEditor } from './context';
import {
  availableOptions,
  deviceFor,
  devicesOf,
  emptyLibrary,
  exportTemplate,
  importTemplate,
  loadLibrary,
  newFeature,
  newTemplate,
  saveLibrary,
  type Feature,
  type Library,
  type Template,
} from './templates';

/**
 * Rack features: the contract, as two lists and a settings column above the
 * rack (doc/PLAN.md 4.3.1).
 *
 * Left is what the rack could have, right is what it has, and the arrows move
 * a feature between them. Putting one in adds the device at the end of every
 * chain (or reuses one already there), binds one macro to every instance,
 * names it, colours it and puts it in a LEADING slot with the rack's own
 * macros shifted right. Taking it out reverses that.
 *
 * **The order of the right-hand list is the order of the knobs**, so it can be
 * dragged. A template holds that order, which is most of what makes a template
 * worth having.
 *
 * The third column belongs to whichever feature is selected: its label, its
 * colour, which nested rack it applies to, and whatever else it carries.
 * Everything the strip does, the codec decides:
 *
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

/** A nested rack a targeted feature can point at: one per chain that holds one. */
interface RackTarget {
  path: string;
  /** The pad or chain it sits in, which is what the label reads. */
  name: string;
}

export function ContractStrip({ rack, onSave }: ContractStripProps) {
  const { apply } = useEditor();
  const [library, setLibrary] = useState<Library>(() => loadLibrary());
  const [rackName, setRackName] = useState(rack.name);
  const [pickedOption, setPickedOption] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [picking, setPicking] = useState<DOMRect | null>(null);
  const importer = useRef<HTMLInputElement>(null);

  useEffect(() => saveLibrary(library), [library]);

  const template = library.templates.find((t) => t.id === library.activeId) ?? library.templates[0];
  const available = availableOptions(template);
  const feature = template.features.find((f) => f.key === selected) ?? null;
  const spec = feature ? optionSpec(feature.option) : null;
  const name = rackName || rack.name;

  // Memoised on the rack handle: every mutation replaces it, and inspecting
  // reads the whole document.
  const statuses = useMemo(
    () => inspectContract(rack, template.features.map((f) => deviceFor(f)!)),
    [rack, template],
  );

  const targets = useMemo(() => nestedRackTargets(rack), [rack]);
  const isDrumRack = rack.deviceEl.tagName === 'DrumGroupDevice';

  /**
   * Re-apply the WHOLE template after any change, rather than patching in the
   * one feature that moved.
   *
   * `applyContract` is safe to re-run and takes its slots from the order it is
   * given, so this is what makes the list's order the knobs' order. Removing
   * takes that one out first, then re-runs the rest, so the survivors close
   * ranks.
   */
  const materialise = useCallback(
    (next: Template, removed?: Feature) => {
      const previous = library;
      setLibrary((lib) => ({ ...lib, templates: lib.templates.map((t) => (t.id === next.id ? next : t)) }));
      const applied = apply([], (r) => {
        if (removed) {
          const device = deviceFor(removed);
          if (device) {
            const result = removeContractOption(r, device, { name: rackName || r.name });
            if (!result.ok) return result;
          }
        }
        const devices = devicesOf(next);
        if (devices.length === 0 && !removed) return { ok: true, warnings: [] };
        return applyContract(r, devices, { name: rackName || undefined });
      });
      // Put the list back when the codec refuses - a rack with no room for
      // another macro, a drum rack asked for a chain selector of its own. A
      // feature listed as being in the rack when it is not is the one thing
      // this strip must never show.
      if (!applied) setLibrary(previous);
    },
    [apply, library, rackName],
  );

  const patch = (key: string, changes: Partial<Feature>) =>
    materialise({ ...template, features: template.features.map((f) => (f.key === key ? { ...f, ...changes } : f)) });

  /**
   * Why the arrow is dead, when it is. A drum rack's pads answer to notes, so
   * a chain selector on the rack itself does nothing (SCHEMA.md Q24) - and if
   * no pad holds a rack there is nothing for it to point at either.
   */
  const picked = pickedOption ? optionSpec(pickedOption) : null;
  const blocked =
    picked?.targetsNestedRack && isDrumRack && targets.length === 0
      ? 'No pad here holds a rack, and a drum rack cannot select its own pads - they answer to notes'
      : null;

  /** Left to right: put the picked option into the rack. */
  const addPicked = () => {
    if (!pickedOption || !picked || blocked) return;
    const target = picked.targetsNestedRack && isDrumRack ? firstFreeTarget(targets, template.features) : undefined;
    const created = newFeature(pickedOption, target ? { targetRack: target.path, targetName: target.name, namePattern: '{target} SEL' } : {});
    if (!created) return;

    setSelected(created.key);
    setPickedOption(null);
    materialise({ ...template, features: [...template.features, created] });
  };

  /** Right to left: take the selected feature back out. */
  const removeSelected = () => {
    if (!feature) return;
    setSelected(null);
    materialise({ ...template, features: template.features.filter((f) => f.key !== feature.key) }, feature);
  };

  const move = (key: string, to: number) => {
    const from = template.features.findIndex((f) => f.key === key);
    if (from < 0 || to < 0 || to >= template.features.length || from === to) return;
    const features = [...template.features];
    const [moved] = features.splice(from, 1);
    features.splice(to, 0, moved);
    materialise({ ...template, features });
  };

  const drag = useListDrag(move);

  const commitRackName = (next: string) => {
    if (next === rackName) return;
    setRackName(next);
    apply([], (r) => applyContract(r, devicesOf(template), { name: next || undefined }));
  };

  // --- templates ---

  const switchTemplate = (id: string) => {
    setSelected(null);
    setLibrary((lib) => ({ ...lib, activeId: id }));
  };

  const addTemplate = (features: Feature[] = []) => {
    const created = { ...newTemplate(`Features ${library.templates.length + 1}`), features };
    setLibrary((lib) => ({ templates: [...lib.templates, created], activeId: created.id }));
    setSelected(null);
  };

  const renameTemplate = (next: string) =>
    setLibrary((lib) => ({ ...lib, templates: lib.templates.map((t) => (t.id === template.id ? { ...t, name: next } : t)) }));

  const deleteTemplate = () => {
    setSelected(null);
    setLibrary((lib) => {
      const templates = lib.templates.filter((t) => t.id !== template.id);
      // Never leave the strip with no template to show.
      return templates.length === 0 ? emptyLibrary() : { templates, activeId: templates[0].id };
    });
  };

  const doImport = async (file: File) => {
    try {
      const imported = importTemplate(await file.text());
      if (!imported) return;
      setLibrary((lib) => ({ templates: [...lib.templates, imported], activeId: imported.id }));
      setSelected(null);
    } catch {
      // A file that is not a template is not worth a dialog: the strip keeps
      // what it has.
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
            key={rack.name}
            defaultValue={rackName}
            placeholder={rack.name}
            title="Names the rack, fills {name} in every feature's label, names the devices the contract adds, and names the saved file."
            onBlur={(e) => commitRackName(e.target.value.trim())}
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

        <div className="contract-templates">
          <label>
            Template
            <select value={template.id} onChange={(e) => switchTemplate(e.target.value)}>
              {library.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <input
            className="contract-template-name"
            key={template.id}
            defaultValue={template.name}
            title="Rename this template"
            onBlur={(e) => renameTemplate(e.target.value.trim() || template.name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <button type="button" onClick={() => addTemplate()} title="A new, empty template">
            New
          </button>
          <button type="button" onClick={() => addTemplate(template.features.map((f) => ({ ...f, key: `${f.key}-copy` })))} title="Copy this template">
            Duplicate
          </button>
          <button type="button" onClick={deleteTemplate} title="Delete this template">
            Delete
          </button>
          <button type="button" onClick={() => download(exportTemplate(template), `${template.name || 'features'}.json`)} title="Save this template as a file">
            Export
          </button>
          <button type="button" onClick={() => importer.current?.click()} title="Load a template from a file">
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
            {available.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  className={`contract-entry${pickedOption === option.id ? ' selected' : ''}`}
                  onClick={() => setPickedOption(option.id)}
                  onDoubleClick={addPicked}
                  title={option.note}
                >
                  <Swatch colorIndex={option.device.colorIndex} />
                  <span className="contract-entry-name">{option.label}</span>
                </button>
              </li>
            ))}
            {available.length === 0 && <li className="contract-empty">every feature is in</li>}
          </ul>
          {blocked && <p className="contract-note warn">{blocked}.</p>}
        </div>

        <div className="contract-arrows">
          <button
            type="button"
            onClick={addPicked}
            disabled={!pickedOption || blocked !== null}
            title={blocked ?? 'Put this feature in the rack'}
          >
            -&gt;
          </button>
          <button type="button" onClick={removeSelected} disabled={!feature} title="Take this feature back out">
            &lt;-
          </button>
        </div>

        <div className="contract-column">
          <h4>In this rack</h4>
          <ul className="contract-list" ref={drag.listRef}>
            {template.features.map((f, i) => {
              const colour = swatchColor(f.colorIndex);
              const status = statuses[i];
              return (
                <li key={f.key} data-feature-index={i} className={drag.dragging === f.key ? 'dragging' : undefined}>
                  <span className="contract-grip" onPointerDown={(e) => drag.start(f.key, e)} title="Drag to reorder - the order here is the order of the knobs">
                    ::
                  </span>
                  <button
                    type="button"
                    className={`contract-entry filled${selected === f.key ? ' selected' : ''}`}
                    style={{ background: colour, color: contrastOn(colour) }}
                    onClick={() => setSelected(f.key)}
                    title={stateTitle(status)}
                  >
                    <span className="contract-entry-slot">{i + 1}</span>
                    <span className="contract-entry-name">{labelOf(optionSpec(f.option)!, f, name)}</span>
                  </button>
                </li>
              );
            })}
            {template.features.length === 0 && <li className="contract-empty">nothing yet - pick one on the left</li>}
          </ul>
        </div>

        <div className="contract-column contract-settings">
          <h4>{spec ? spec.label : 'Settings'}</h4>
          {!feature && <p className="contract-empty">Pick a feature to set its name, colour and target.</p>}
          {feature && spec && (
            <>
              <label className="contract-field">
                {spec.device.parameter === undefined ? 'Device name' : 'Macro label'}
                <span className="contract-field-row">
                  <button
                    type="button"
                    className="contract-swatch"
                    style={{ background: swatchColor(feature.colorIndex) }}
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
                    key={`${feature.key}:${feature.namePattern}`}
                    defaultValue={feature.namePattern}
                    title="{name} becomes the rack name, {target} the pad this points at."
                    onBlur={(e) => patch(feature.key, { namePattern: e.target.value || spec.device.namePattern })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                  />
                </span>
              </label>

              {spec.targetsNestedRack && (
                <label className="contract-field">
                  Applies to
                  <select
                    value={feature.targetRack ?? ''}
                    onChange={(e) => {
                      const target = targets.find((t) => t.path === e.target.value);
                      patch(feature.key, target ? { targetRack: target.path, targetName: target.name } : { targetRack: undefined, targetName: undefined });
                    }}
                  >
                    {/* A drum rack's own selector is not offered: its pads
                        answer to notes, so the knob would do nothing. */}
                    {!isDrumRack && <option value="">this rack</option>}
                    {targets.map((t) => (
                      <option key={t.path} value={t.path}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {spec.device.parameter !== undefined && isLongLabel(labelOf(spec, feature, name)) && (
                <p className="contract-note warn">
                  Live wraps a label this long onto a second line and the whole rack grows with it. Twelve characters fit.
                </p>
              )}

              {(spec.settings ?? []).map((setting) => (
                <label key={setting.id} className="contract-setting">
                  <input
                    type="checkbox"
                    checked={Boolean(feature.settings[setting.id])}
                    onChange={(e) => patch(feature.key, { settings: { ...feature.settings, [setting.id]: e.target.checked } })}
                  />
                  <span>
                    {setting.label}
                    {setting.note && <em className="contract-note">{setting.note}</em>}
                  </span>
                </label>
              ))}

              {spec.note && <p className="contract-note">{spec.note}</p>}
              <p className="contract-note">{stateTitle(statuses[template.features.indexOf(feature)])}.</p>

              {picking && (
                <ColorPicker
                  current={feature.colorIndex ?? -1}
                  anchor={picking}
                  onPick={(colorIndex) => {
                    setPicking(null);
                    patch(feature.key, { colorIndex });
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

/**
 * Drag a feature up or down the list to change the order its knobs land in.
 *
 * Pointer events, not HTML5 drag-and-drop, for the reason the rest of this UI
 * uses them (doc/PLAN.md D3): DnD does nothing in a real browser here and
 * cannot be relied on inside the Max `jweb` webview. Listeners attach in the
 * pointerdown handler, so a fast drag cannot finish before they exist.
 */
function useListDrag(move: (key: string, to: number) => void) {
  const [dragging, setDragging] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const start = (key: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragging(key);

    const indexUnder = (y: number) => {
      const rows = Array.from(listRef.current?.querySelectorAll('[data-feature-index]') ?? []);
      for (const row of rows) {
        const box = row.getBoundingClientRect();
        if (y >= box.top && y <= box.bottom) return Number(row.getAttribute('data-feature-index'));
      }
      return null;
    };

    let landed: number | null = null;
    const onMove = (ev: PointerEvent) => {
      landed = indexUnder(ev.clientY);
    };
    const finish = (ev: PointerEvent) => {
      const to = indexUnder(ev.clientY) ?? landed;
      detach();
      setDragging(null);
      if (to !== null) move(key, to);
    };
    const cancel = () => {
      detach();
      setDragging(null);
    };
    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
  };

  return { dragging, start, listRef };
}

/** Every nested rack a targeted feature could point at, named after the chain or pad holding it. */
function nestedRackTargets(rack: Rack): RackTarget[] {
  const targets: RackTarget[] = [];
  rack.chains.forEach((chain, i) => {
    for (const device of chain.devices) {
      if (!device.isRack) continue;
      targets.push({ path: device.path, name: chain.name || device.name || `Chain ${i + 1}` });
    }
  });
  return targets;
}

/** The first nested rack no instance of this feature has claimed yet, so adding a second one lands on the next pad. */
function firstFreeTarget(targets: readonly RackTarget[], features: readonly Feature[]): RackTarget | undefined {
  const taken = new Set(features.map((f) => f.targetRack));
  return targets.find((t) => !taken.has(t.path)) ?? targets[0];
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

const labelOf = (spec: ContractOptionSpec, feature: Feature, name: string) =>
  (feature.namePattern || spec.device.namePattern).replace(/\{name\}/g, name).replace(/\{target\}/g, feature.targetName ?? '');

/** Twelve fits on a knob, twenty-one wraps and takes the rack's height with it (SCHEMA.md Q19). */
const isLongLabel = (label: string) => label.length > 12;

/**
 * What the rack already does about this feature. Partial is worth its own
 * word: it is the state where the tool is about to ADD something to some
 * chains and reuse what is in the others (doc/PLAN.md 4.3.3).
 */
function stateTitle(status: ContractStatus | undefined): string {
  if (!status) return '';
  if (status.state === 'satisfied') {
    return status.slot === null ? 'Already at the end of every chain' : `On macro ${status.slot + 1}, driving every chain`;
  }
  if (status.state === 'partial') {
    return `In ${status.chainsCovered} of ${status.chainCount} chains - adding it covers the rest and binds them all to one macro`;
  }
  return 'Not in the rack yet';
}

/** A template as a downloaded file. Nothing leaves the browser: this is a blob URL, not an upload. */
function download(json: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
