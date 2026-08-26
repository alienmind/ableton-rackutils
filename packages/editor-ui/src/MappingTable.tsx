import { useEffect, useState } from 'react';
import { invertBindingRange, setBindingRange, unbindOne } from '@rackutils/adg-codec';
import type { Rack } from '@rackutils/adg-codec';
import { collectMappings, type MacroMapping } from './mappings';
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
 *
 * **A macro driving several parameters is ONE collapsed row**, because that is
 * exactly what the contract writes: one knob across every chain. Four
 * identical rows say nothing four times. Double-click the row to open it, or
 * use Expand all.
 */
/**
 * Which column the list is sorted by, as Live's own list can be. Null is the
 * order the rack is written in - root macros in slot order, then each nested
 * rack's - which is the only order that says where a macro physically is, so
 * it stays the default and a second click on a sorted header returns to it.
 */
type SortColumn = 'macro' | 'path' | 'name';
interface Sort {
  column: SortColumn;
  descending: boolean;
}

/**
 * A sortable column header. Declared out here rather than inside the table:
 * a component defined in a render body is a new type on every render, so
 * React would remount the button and the click that sorted the list would
 * take the focus with it.
 */
function SortHeader({
  column,
  className,
  sort,
  onSort,
  children,
}: {
  column: SortColumn;
  className: string;
  sort: Sort | null;
  onSort: (column: SortColumn) => void;
  children: React.ReactNode;
}) {
  const active = sort?.column === column;
  return (
    <th
      className={`${className}${active ? ' is-sorted' : ''}`}
      aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'}
    >
      <button type="button" className="mapping-sort" onClick={() => onSort(column)}>
        {children}
        <span className="mapping-sort-arrow" aria-hidden="true">
          {active ? (sort.descending ? '▾' : '▴') : ''}
        </span>
      </button>
    </th>
  );
}

/** Sorting is by GROUP, never inside one: an opened macro's targets stay together under it. */
function sortKey(row: MacroMapping, column: SortColumn): string | number {
  if (column === 'macro') return row.macroIndex;
  if (column === 'path') return `${row.rackName} ${row.targets[0]?.device ?? ''}`.toLowerCase();
  return (row.targets[0]?.parameter ?? '').toLowerCase();
}

export function MappingTable({ rack }: MappingTableProps) {
  const { apply } = useEditor();
  const collected = collectMappings(rack);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort | null>(null);

  const rows = sort
    ? [...collected].sort((a, b) => {
        const left = sortKey(a, sort.column);
        const right = sortKey(b, sort.column);
        const order = left < right ? -1 : left > right ? 1 : 0;
        return sort.descending ? -order : order;
      })
    : collected;

  // Three states per column: up, down, and back to the order of the file.
  const clickSort = (column: SortColumn) =>
    setSort((current) => {
      if (current?.column !== column) return { column, descending: false };
      return current.descending ? null : { column, descending: true };
    });

  const groupKey = (row: (typeof rows)[number]) => `${row.rackPath.join('|')}:${row.macroIndex}`;
  const toggle = (key: string) =>
    setOpened((open) => {
      const next = new Set(open);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  if (rows.length === 0) {
    return (
      <section className="mapping-table">
        <h3>Macro Mappings</h3>
        <p className="mapping-empty">Nothing is mapped yet. Drag a parameter onto a macro knob to start.</p>
      </section>
    );
  }

  return (
    <section className="mapping-table">
      <h3>
        Macro Mappings <span className="mapping-count">{rows.reduce((n, r) => n + r.targets.length, 0)}</span>
        {rows.some((r) => r.targets.length > 1) && (
          <button
            type="button"
            className="mapping-expand-all"
            onClick={() => setOpened(opened.size === 0 ? new Set(rows.filter((r) => r.targets.length > 1).map(groupKey)) : new Set())}
          >
            {opened.size === 0 ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </h3>
      {/* The table has six columns and a phone has none to spare, so it
          scrolls inside its own box rather than squeezing Min and Max down to
          two characters or pushing the unbind control off the screen. */}
      <div className="mapping-scroll">
        <table className="mapping-grid">
        <thead>
          <tr>
            <SortHeader column="macro" className="col-macro" sort={sort} onSort={clickSort}>
              Macro
            </SortHeader>
            <SortHeader column="path" className="col-path" sort={sort} onSort={clickSort}>
              Path
            </SortHeader>
            <SortHeader column="name" className="col-name" sort={sort} onSort={clickSort}>
              Name
            </SortHeader>
            <th className="col-num">Min</th>
            <th className="col-num">Max</th>
            <th className="col-actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = groupKey(row);
            // One target is its own summary: collapsing it would hide the row
            // and gain nothing.
            if (row.targets.length > 1 && !opened.has(key)) {
              const parameters = [...new Set(row.targets.map((t) => t.parameter))];
              const devices = [...new Set(row.targets.map((t) => t.device))];
              return (
                <tr
                  key={key}
                  className="mapping-summary"
                  style={{ '--mapped-color': row.color } as React.CSSProperties}
                  onDoubleClick={() => toggle(key)}
                  title="Double-click to open"
                >
                  <td className="col-macro">
                    <span className="mapping-slot">{row.macroIndex + 1}</span>
                    <span className="mapping-macro">{row.macroName}</span>
                  </td>
                  <td className="col-path">
                    {row.rackName} | {devices.length === 1 ? devices[0] : `${devices.length} devices`}
                  </td>
                  <td className="col-name">
                    {parameters.length === 1 ? parameters[0] : `${parameters.length} parameters`}
                    <span className="mapping-fanout">x{row.targets.length}</span>
                  </td>
                  <td className="col-num" />
                  <td className="col-num" />
                  <td className="col-actions">
                    <button type="button" className="mapping-open" onClick={() => toggle(key)} title="Show every target">
                      ...
                    </button>
                  </td>
                </tr>
              );
            }
            return row.targets.map((t) => {
              const key = `${row.rackPath.join('|')}:${row.macroIndex}:${t.targetPath}`;
              return (
                <tr
                  key={key}
                  style={{ '--mapped-color': row.color } as React.CSSProperties}
                  onDoubleClick={() => row.targets.length > 1 && toggle(groupKey(row))}
                >
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
                  {/* A plugin's range is its own normalized 0..1 and is stored
                      in a differently shaped element (SCHEMA.md Q20), so it is
                      shown and not offered for editing - writing an
                      Ableton-shaped range there makes a file that loads and
                      behaves wrong. */}
                  <td className="col-num">
                    {t.plugin ? (
                      <span className="mapping-fixed" title="the plugin's own range">
                        {t.rangeMin}
                      </span>
                    ) : (
                      <RangeCell
                        value={t.rangeMin}
                        label={`Minimum of ${t.parameter}`}
                        onCommit={(min) =>
                          apply(row.rackPath, (r) =>
                            setBindingRange(r, row.macroIndex, t.targetPath, { min, max: t.rangeMax }),
                          )
                        }
                      />
                    )}
                  </td>
                  <td className="col-num">
                    {t.plugin ? (
                      <span className="mapping-fixed" title="the plugin's own range">
                        {t.rangeMax}
                      </span>
                    ) : (
                      <RangeCell
                        value={t.rangeMax}
                        label={`Maximum of ${t.parameter}`}
                        onCommit={(max) =>
                          apply(row.rackPath, (r) =>
                            setBindingRange(r, row.macroIndex, t.targetPath, { min: t.rangeMin, max }),
                          )
                        }
                      />
                    )}
                  </td>
                  <td className="col-actions">
                    {!t.plugin && (
                      <button
                        type="button"
                        className={`mapping-invert${t.inverted ? ' is-inverted' : ''}`}
                        title={`Invert the range on ${t.parameter}`}
                        onClick={() => apply(row.rackPath, (r) => invertBindingRange(r, row.macroIndex, t.targetPath))}
                      >
                        &#8646;
                      </button>
                    )}
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
            });
          })}
        </tbody>
        </table>
      </div>
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
