import type { Macro } from '@rackutils/adg-codec';
import { MacroKnob } from './MacroKnob';

export interface MacroBankProps {
  /** Always 16 from the codec (SCHEMA.md Q7). `macroCount` decides how many are shown normally. */
  macros: readonly Macro[];
  macroCount: number;
  armed: boolean;
  liveValues?: Record<number, number>;
  onReorder: (from: number, to: number) => void;
  onSwap: (a: number, b: number) => void;
  onBindArmed: (macroIndex: number) => void;
  onRename: (index: number, name: string) => void;
  onRecolor: (index: number, colorIndex: number) => void;
  onUnbindOne: (index: number, targetPath: string) => void;
}

export function MacroBank(props: MacroBankProps) {
  const { macros, macroCount, armed, liveValues, onReorder, onSwap, onBindArmed, onRename, onRecolor, onUnbindOne } = props;

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
      onReorder={(from) => onReorder(from, macro.index)}
      onSwap={(from) => onSwap(from, macro.index)}
      onClick={() => onBindArmed(macro.index)}
      onRename={(name) => onRename(macro.index, name)}
      onRecolor={(colorIndex) => onRecolor(macro.index, colorIndex)}
      onUnbindOne={(targetPath) => onUnbindOne(macro.index, targetPath)}
    />
  );

  return (
    <div className="macro-bank-wrap">
      <div className="macro-bank">{visible.map((m) => knob(m, false))}</div>
      {hiddenButMapped.length > 0 && (
        <details className="hidden-macros">
          <summary>
            {hiddenButMapped.length} hidden {hiddenButMapped.length === 1 ? 'macro is' : 'macros are'} still mapped - raise the macro count to see
            {hiddenButMapped.length === 1 ? ' it' : ' them'} in Live
          </summary>
          <div className="macro-bank">{hiddenButMapped.map((m) => knob(m, true))}</div>
        </details>
      )}
    </div>
  );
}
