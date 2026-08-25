import { unbindOne } from '@rackutils/adg-codec';
import type { Rack } from '@rackutils/adg-codec';
import { collectMappings } from './mappings';
import { useEditor } from './context';

export interface MappingTableProps {
  rack: Rack;
}

/**
 * Every mapping in the rack, in full, below the row:
 *
 *   Rack  ->  Macro  ->  Device  ->  Parameter
 *
 * with a macro's several parameters stacked under it.
 *
 * This exists because the knobs could not carry it. A macro can drive any
 * number of parameters, and listing them all inside a 58px knob pushed the
 * grid apart as soon as a rack was realistic. The knob keeps a summary; the
 * whole truth is here, where vertical space is free.
 *
 * It is also the only place that answers "what does this rack actually do?"
 * in one read, including nested racks, which are otherwise several clicks deep.
 */
export function MappingTable({ rack }: MappingTableProps) {
  const { apply } = useEditor();
  const rows = collectMappings(rack);

  if (rows.length === 0) {
    return (
      <section className="mapping-table">
        <h4>Mappings</h4>
        <p className="mapping-empty">Nothing is mapped yet. Drag a parameter onto a macro knob to start.</p>
      </section>
    );
  }

  return (
    <section className="mapping-table">
      <h4>
        Mappings <span className="mapping-count">{rows.reduce((n, r) => n + r.targets.length, 0)}</span>
      </h4>
      <ul className="mapping-rows">
        {rows.map((row) => (
          <li key={`${row.rackPath.join('|')}:${row.macroIndex}`} style={{ '--mapped-color': row.color } as React.CSSProperties}>
            <span className="mapping-rack" title={row.rackName}>
              {row.rackName}
            </span>
            <span className="mapping-arrow">-&gt;</span>
            <span className="mapping-macro">
              <span className="mapping-slot">{row.macroIndex + 1}</span>
              {row.macroName}
            </span>
            <span className="mapping-arrow">-&gt;</span>
            <ul className="mapping-targets">
              {row.targets.map((t) => (
                <li key={t.targetPath}>
                  <span className="mapping-device">{t.device}</span>
                  <span className="mapping-arrow">-&gt;</span>
                  <span className="mapping-param">{t.parameter}</span>
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
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
