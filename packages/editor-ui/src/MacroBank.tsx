import type { Macro } from '@rackutils/adg-codec';
import { MacroKnob } from './MacroKnob';
import { useEditor, type RackPath } from './context';
import { useMacroDrag } from './useMacroDrag';

export interface MacroBankProps {
  /** Always 16 from the codec (SCHEMA.md Q7). `macroCount` decides how many are shown normally. */
  macros: readonly Macro[];
  macroCount: number;
  armed: boolean;
  /** Identifies which rack these knobs belong to, so a parameter dragged from another rack can be refused (SCHEMA.md Q2). */
  rackPath: RackPath;
  liveValues?: Record<number, number>;
  onReorder: (from: number, to: number) => void;
  onSwap: (a: number, b: number) => void;
  onBindArmed: (macroIndex: number) => void;
  onRename: (index: number, name: string) => void;
  onRecolor: (index: number, colorIndex: number) => void;
  onUnbindOne: (index: number, targetPath: string) => void;
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
  const { macros, macroCount, armed, rackPath, liveValues, onReorder, onSwap, onBindArmed, onRename, onRecolor, onUnbindOne } = props;
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
      bindTarget={paramDrag.param !== null && paramDrag.overMacro === macro.index && !paramDrag.overForeignRack}
      onDragStart={(e) => startDrag(macro.index, e)}
      onClick={() => onBindArmed(macro.index)}
      onRename={(name) => onRename(macro.index, name)}
      onRecolor={(colorIndex) => onRecolor(macro.index, colorIndex)}
      onUnbindOne={(targetPath) => onUnbindOne(macro.index, targetPath)}
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
