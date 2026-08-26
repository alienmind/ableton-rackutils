import type { Macro } from '@rackutils/adg-codec';
import { MacroKnob } from './MacroKnob';
import { useEditor, type RackPath } from './context';
import { macroKey } from './MappingCables';
import { useMacroDrag } from './useMacroDrag';

export interface MacroBankProps {
  /** Always 16 from the codec (SCHEMA.md Q7). `macroCount` decides how many are shown normally. */
  macros: readonly Macro[];
  macroCount: number;
  armed: boolean;
  /** Identifies which rack these knobs belong to, so a parameter dragged from another rack can be refused (SCHEMA.md Q2). */
  rackPath: RackPath;
  liveValues?: Record<number, number>;
  /** Map mode: knobs stop being draggable macros and become mapping sources. */
  mapping: boolean;
  /** Start a mapping drag from this rack's knob, addressed from the parent (SCHEMA.md Q22). Absent on the root rack, which has no parent to map from. */
  onMapSource?: (index: number, e: React.PointerEvent) => void;
  /**
   * How the rack ABOVE addresses each of these knobs - its `MacroControls.N`
   * path taken against the parent. That is the far end of a parent's cable, so
   * the knob has to answer to it as well as to its own address.
   */
  parentKeys?: readonly (string | null)[];
  onReorder: (from: number, to: number) => void;
  onSwap: (a: number, b: number) => void;
  onBindArmed: (macroIndex: number) => void;
  onRename: (index: number, name: string) => void;
  onRecolor: (index: number, colorIndex: number) => void;
  onReset: (index: number) => void;
}

/**
 * The macro panel, laid out the way Live lays it out: two rows, numbered
 * ACROSS then down.
 *
 *   8 macros:  1 2 3 4     NOT  1 3 5 7
 *              5 6 7 8          2 4 6 8
 *
 * The first cut used a column-flow grid and got the second layout, which reads
 * wrong the moment you count knobs against Live. Row-major also makes the +/-
 * buttons behave: adding a pair extends both rows by one column, so the grid
 * is `ceil(count / 2)` columns wide and never ragged.
 */
export function MacroBank(props: MacroBankProps) {
  const { macros, macroCount, armed, rackPath, liveValues, mapping, onMapSource, parentKeys, onReorder, onSwap, onBindArmed, onRename, onRecolor, onReset } = props;
  const { drag, startDrag } = useMacroDrag({ onReorder, onSwap });
  const { paramDrag } = useEditor();

  const visible = macros.slice(0, macroCount);
  // Shrinking the visible count hides macros, it never unbinds them (Part 2.4,
  // SCHEMA.md Q7). A mapped macro above the count would otherwise vanish with
  // no explanation while still driving something.
  const hiddenButMapped = macros.slice(macroCount).filter((m) => m.bindings.length > 0);

  const knob = (macro: Macro, hidden: boolean) => (
    <MacroKnob
      key={macro.index}
      macro={macro}
      hidden={hidden}
      liveValue={liveValues?.[macro.index]}
      armed={armed}
      dragging={drag.from === macro.index}
      dropTarget={drag.from !== null && drag.over === macro.index && drag.from !== macro.index}
      dropSwaps={drag.swap}
      // Not a target when it is already the answer: the parameter is bound to
      // this macro, so there is nothing to light up.
      bindTarget={paramDrag.param !== null && paramDrag.overMacro === macro.index && !paramDrag.overForeignRack && !paramDrag.overBound}
      mapSource={mapping && onMapSource !== undefined}
      mapKeys={[macroKey(rackPath, macro.index), parentKeys?.[macro.index]].filter(Boolean).join(' ')}
      // In Map mode a knob is a source, not a macro to move: the two gestures
      // start identically, so only one of them can be live at a time.
      onDragStart={(e) => (mapping ? onMapSource?.(macro.index, e) : startDrag(macro.index, e))}
      onClick={() => onBindArmed(macro.index)}
      onRename={(name) => onRename(macro.index, name)}
      onRecolor={(colorIndex) => onRecolor(macro.index, colorIndex)}
      onReset={() => onReset(macro.index)}
    />
  );

  const columns = Math.max(1, Math.ceil(macroCount / 2));

  return (
    <div className={`macro-bank-wrap${drag.from !== null ? ' dragging' : ''}`} data-rack-path={rackPath.join('|')}>
      <div className="macro-bank" style={{ gridTemplateColumns: `repeat(${columns}, auto)` }}>
        {visible.map((m) => knob(m, false))}
      </div>
      {hiddenButMapped.length > 0 && (
        <details className="hidden-macros">
          <summary>
            {hiddenButMapped.length} hidden {hiddenButMapped.length === 1 ? 'macro is' : 'macros are'} still mapped
          </summary>
          <div className="macro-bank">{hiddenButMapped.map((m) => knob(m, true))}</div>
        </details>
      )}
    </div>
  );
}
