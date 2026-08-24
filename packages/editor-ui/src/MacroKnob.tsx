import { useState } from 'react';
import type { Macro } from '@rackutils/adg-codec';
import { arcPath, KNOB_MAX_DEG, KNOB_MIN_DEG, valueToDegrees } from './arc';
import { ColorPicker } from './ColorPicker';
import { macroColor } from './macroColors';

export const MACRO_DRAG_TYPE = 'text/macro-index';

export interface MacroKnobProps {
  macro: Macro;
  /** M4L device only. Drawn distinctly from the stored value: they are different things (doc/PLAN.md Constraint 1) and must never look alike. */
  liveValue?: number;
  /** Something is armed, so clicking this knob binds it here. */
  armed: boolean;
  hidden?: boolean;
  onReorder: (from: number) => void;
  onSwap: (from: number) => void;
  onClick: () => void;
  onRename: (name: string) => void;
  onRecolor: (colorIndex: number) => void;
  onUnbindOne: (targetPath: string) => void;
}

/**
 * PLACEHOLDER SHAPE. The real geometry comes from `doc/UI-PLAN.md` Part 1,
 * which is on hold - this is an arc-sweep knob built to that plan's sketch so
 * the interactions can be finished without it. Swapping in the extracted SVG
 * should touch this file's `<svg>` block and `editor.css`, nothing structural.
 */
export function MacroKnob({ macro, liveValue, armed, hidden, onReorder, onSwap, onClick, onRename, onRecolor, onUnbindOne }: MacroKnobProps) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [dropHint, setDropHint] = useState<'reorder' | 'swap' | null>(null);

  const mapped = macro.bindings.length > 0;
  const color = macroColor(macro.color);
  const angle = valueToDegrees(macro.value);

  const classes = ['macro-knob', mapped ? 'mapped' : 'unmapped'];
  if (armed) classes.push('bindable');
  if (hidden) classes.push('hidden-slot');
  if (dropHint) classes.push(`drop-${dropHint}`);

  return (
    <div
      className={classes.join(' ')}
      draggable={!editing}
      onDragStart={(e) => e.dataTransfer.setData(MACRO_DRAG_TYPE, String(macro.index))}
      onDragOver={(e) => {
        e.preventDefault();
        setDropHint(e.shiftKey ? 'swap' : 'reorder');
      }}
      onDragLeave={() => setDropHint(null)}
      onDrop={(e) => {
        e.preventDefault();
        setDropHint(null);
        const from = Number(e.dataTransfer.getData(MACRO_DRAG_TYPE));
        if (!Number.isInteger(from) || from === macro.index) return;
        (e.shiftKey ? onSwap : onReorder)(from);
      }}
    >
      <button
        type="button"
        className="macro-knob-dial"
        onClick={onClick}
        title={armed ? `Bind the armed parameter to macro ${macro.index + 1}` : `Macro ${macro.index + 1}`}
      >
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path className="knob-track" d={arcPath(32, 32, 25, KNOB_MIN_DEG, KNOB_MAX_DEG)} />
          <path className="knob-fill" style={{ stroke: mapped ? color : undefined }} d={arcPath(32, 32, 25, KNOB_MIN_DEG, angle)} />
          {liveValue !== undefined && <path className="knob-live" d={arcPath(32, 32, 18, KNOB_MIN_DEG, valueToDegrees(liveValue))} />}
        </svg>
        <span className="macro-knob-slot">{macro.index + 1}</span>
      </button>

      {editing ? (
        <input
          className="macro-knob-name-input"
          autoFocus
          defaultValue={macro.name}
          onBlur={(e) => {
            onRename(e.target.value);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            // Escape cancels without mutating - blur would commit, so drop the
            // edit state first and let the blur handler find nothing to do.
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span className="macro-knob-name" onDoubleClick={() => setEditing(true)} title="Double-click to rename">
          {macro.name}
        </span>
      )}

      <button type="button" className="macro-knob-swatch" style={{ background: color }} onClick={() => setPicking((p) => !p)} title="Colour">
        <span className="sr-only">Change colour</span>
      </button>
      {picking && (
        <ColorPicker
          current={macro.color}
          onPick={(i) => {
            onRecolor(i);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {mapped && (
        <ul className="macro-knob-targets">
          {macro.bindings.map((binding) => (
            <li key={binding.targetPath}>
              <span className="target-name" title={`${binding.targetName} [${binding.rangeMin}..${binding.rangeMax}]${binding.inverted ? ' inverted' : ''}`}>
                {binding.targetName}
              </span>
              <button type="button" className="unbind" onClick={() => onUnbindOne(binding.targetPath)} title="Unbind this parameter only">
                x
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
