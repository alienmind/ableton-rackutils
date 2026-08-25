import { useEffect, useState } from 'react';
import { invertBindingRange, setBindingRange, unbindOne } from '@rackutils/adg-codec';
import type { Rack } from '@rackutils/adg-codec';
import { collectMappings } from './mappings';
import { useEditor } from './context';

export interface MappingTableProps {
  rack: Rack;
}

/**
 * Every mapping in the rack, laid out like Live's own Macro Mappings list:
 * one row per binding, with Macro, Path, Name, Min and Max.
 *
 * This exists because the knobs could not carry it. A macro can drive any
 * number of parameters, and listing them all inside a 58px knob pushed the
 * grid apart as soon as a rack was realistic. The knob keeps a summary; the
 * whole truth is here, where vertical space is free.
 *
 * It is also the only place that answers "what does this rack actually do?"
 * in one read, including nested racks, which are otherwise several clicks deep.
 *
 * Min and Max are the target parameter's own units, and the file stores no
 * unit for them, so they are shown raw. An inverted range is stored as
 * Min > Max (SCHEMA.md Q4), which is why the invert control swaps the two
 * numbers rather than setting a flag.
 */
export function MappingTable({ rack }: MappingTableProps) {
  const { apply } = useEditor();
  const rows = collectMappings(rack);

  if (rows.length === 0) {
    return (
      <section className="mapping-table">
        <h4>Macro Mappings</h4>
        <p className="mapping-empty">Nothing is mapped yet. Drag a parameter onto a macro knob to start.</p>
      </section>
    );
  }

  return (
    <section className="mapping-table">
      <h4>
        Macro Mappings <span className="mapping-count">{rows.reduce((n, r) => n + r.targets.length, 0)}</span>
      </h4>
      <table className="mapping-grid">
        <thead>
          <tr>
            <th className="col-macro">Macro</th>
            <th className="col-path">Path</th>
            <th className="col-name">Name</th>
            <th className="col-num">Min</th>
            <th className="col-num">Max</th>
            <th className="col-actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            row.targets.map((t) => {
              const key = `${row.rackPath.join('|')}:${row.macroIndex}:${t.targetPath}`;
              return (
                <tr key={key} style={{ '--mapped-color': row.color } as React.CSSProperties}>
                  <td className="col-macro">
                    <span className="mapping-slot">{row.macroIndex + 1}</span>
                    <span className="mapping-macro">{row.macroName}</span>
                  </td>
                  <td className="col-path" title={`${row.rackName} | ${t.device}`}>
                    {row.rackName} | {t.device}
                  </td>
                  <td className="col-name" title={t.parameter}>
                    {t.parameter}
                  </td>
                  <td className="col-num">
                    <RangeCell
                      value={t.rangeMin}
                      label={`Minimum of ${t.parameter}`}
                      onCommit={(min) =>
                        apply(row.rackPath, (r) =>
                          setBindingRange(r, row.macroIndex, t.targetPath, { min, max: t.rangeMax }),
                        )
                      }
                    />
                  </td>
                  <td className="col-num">
                    <RangeCell
                      value={t.rangeMax}
                      label={`Maximum of ${t.parameter}`}
                      onCommit={(max) =>
                        apply(row.rackPath, (r) =>
                          setBindingRange(r, row.macroIndex, t.targetPath, { min: t.rangeMin, max }),
                        )
                      }
                    />
                  </td>
                  <td className="col-actions">
                    <button
                      type="button"
                      className={`mapping-invert${t.inverted ? ' is-inverted' : ''}`}
                      title={`Invert the range on ${t.parameter}`}
                      onClick={() => apply(row.rackPath, (r) => invertBindingRange(r, row.macroIndex, t.targetPath))}
                    >
                      &#8646;
                    </button>
                    {/* Unbinds THIS parameter only. A macro often drives several
                        and the others must survive (SCHEMA.md, the multi-target
                        bugfix) - `unbindMacro` would clear the lot. */}
                    <button
                      type="button"
                      className="mapping-unbind"
                      title={`Unbind ${t.parameter} from ${row.macroName}`}
                      onClick={() => apply(row.rackPath, (r) => unbindOne(r, row.macroIndex, t.targetPath))}
                    >
                      x
                    </button>
                  </td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </section>
  );
}

/**
 * A number that only reaches the codec once, on Enter or blur. Typing into it
 * cannot fire a mutation per keystroke: every mutation clones the rack and
 * pushes an undo entry, so "35" would cost two of each and leave a partial
 * value ("3") in the file on the way through.
 */
function RangeCell({ value, label, onCommit }: { value: number; label: string; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));

  // The rack is the source of truth: a mutation elsewhere (an invert, an undo)
  // has to show up here rather than being masked by a stale draft.
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n === value) {
      setDraft(String(value));
      return;
    }
    onCommit(n);
  };

  return (
    <input
      className="mapping-range"
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(String(value));
          e.currentTarget.blur();
        }
      }}
    />
  );
}
