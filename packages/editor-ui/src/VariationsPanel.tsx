import type { Variation } from '@rackutils/adg-codec';

export interface VariationsPanelProps {
  variations: readonly Variation[];
}

/**
 * The Macro Variations panel, to the left of the macros as Live places it.
 *
 * Read-only for now: the codec reads variations (`rack.variations`) and every
 * slot-changing mutation permutes them (Constraint 4), but there is no
 * mutation for creating, recalling or deleting one. Showing them still earns
 * its place - a rack with variations is the case where a careless macro edit
 * does the most damage, and seeing them is the reminder that they exist.
 */
export function VariationsPanel({ variations }: VariationsPanelProps) {
  return (
    <div className="variations-panel">
      <div className="variations-title">Macro Variations</div>
      {variations.length === 0 ? (
        <p className="variations-empty">none</p>
      ) : (
        <ul className="variations-list">
          {variations.map((v) => (
            <li key={v.index} title={`Variation ${v.index + 1}`}>
              {v.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
