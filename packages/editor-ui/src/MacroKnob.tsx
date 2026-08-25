import { useState } from 'react';
import type { Macro } from '@rackutils/adg-codec';
import { arcPath, KNOB_MAX_DEG, KNOB_MIN_DEG, valueToDegrees } from './arc';
import { ColorPicker } from './ColorPicker';
import { macroColor } from './macroColors';

export interface MacroKnobProps {
  macro: Macro;
  /** M4L device only. Drawn distinctly from the stored value: they are different things (doc/PLAN.md Constraint 1) and must never look alike. */
  liveValue?: number;
  /** Something is armed, so clicking this knob binds it here. */
  armed: boolean;
  hidden?: boolean;
  dragging: boolean;
  dropTarget: boolean;
  dropSwaps: boolean;
  /** A parameter is being dragged and would bind here if dropped. */
  bindTarget: boolean;
  onDragStart: (e: React.PointerEvent) => void;
  onClick: () => void;
  onRename: (name: string) => void;
  onRecolor: (colorIndex: number) => void;
}

/**
 * PLACEHOLDER SHAPE: an arc-sweep dial, not a redrawn Live knob. The colours
 * are Live's own now (`macroColors.ts`); the geometry is not.
 *
 * Colour goes on the LABEL, not the dial - Live draws every knob's arc the
 * same blue whatever colour the macro is, and tinting the arc as well made a
 * rack look like a paint chart.
 *
 * The knob does NOT list what it drives. A macro can drive any number of
 * parameters and naming them here pushed the grid apart; the mapping table
 * below carries the full list, and the unbind control with it.
 */
export function MacroKnob(props: MacroKnobProps) {
  const { macro, liveValue, armed, hidden, dragging, dropTarget, dropSwaps, bindTarget } = props;
  const { onDragStart, onClick, onRename, onRecolor } = props;
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState<DOMRect | null>(null);

  const mapped = macro.bindings.length > 0;
  const color = macroColor(macro.color);
  const angle = valueToDegrees(macro.value);

  const classes = ['macro-knob', mapped ? 'mapped' : 'unmapped'];
  if (armed) classes.push('bindable');
  if (hidden) classes.push('hidden-slot');
  if (dragging) classes.push('dragging');
  if (dropTarget) classes.push(dropSwaps ? 'drop-swap' : 'drop-reorder');
  if (bindTarget) classes.push('bind-target');

  return (
    <div className={classes.join(' ')} data-macro-index={macro.index} style={{ '--macro-color': color } as React.CSSProperties}>
      <div className="macro-knob-dial" onPointerDown={onDragStart} onClick={onClick} title={armed ? `Bind the armed parameter here` : 'Drag to move, Shift-drag to swap'}>
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle className="knob-body" cx="32" cy="32" r="19" />
          <path className="knob-track" d={arcPath(32, 32, 25, KNOB_MIN_DEG, KNOB_MAX_DEG)} />
          <path className="knob-fill" d={arcPath(32, 32, 25, KNOB_MIN_DEG, angle)} />
          {/* A pointer as well as the arc, so a macro at 0 still reads as "at zero" rather than as blank. */}
          <line
            className="knob-pointer"
            x1="32"
            y1="32"
            x2={32 + 15 * Math.cos(((angle - 90) * Math.PI) / 180)}
            y2={32 + 15 * Math.sin(((angle - 90) * Math.PI) / 180)}
          />
          {liveValue !== undefined && <path className="knob-live" d={arcPath(32, 32, 10, KNOB_MIN_DEG, valueToDegrees(liveValue))} />}
        </svg>
        <span className="macro-knob-slot">{macro.index + 1}</span>
      </div>

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
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span className="macro-knob-name" onDoubleClick={() => setEditing(true)} title={`${macro.name} - double-click to rename`}>
          {macro.name}
        </span>
      )}

      <button
        type="button"
        className="macro-knob-swatch"
        onClick={(e) => {
          // Read the box BEFORE the state updater runs: React has cleared
          // `currentTarget` by the time a functional update is applied, so
          // reading it in there throws and the popover never opens.
          const anchor = e.currentTarget.getBoundingClientRect();
          setPicking((p) => (p ? null : anchor));
        }}
        title="Colour"
      >
        <span className="sr-only">Change colour</span>
      </button>
      {picking && (
        <ColorPicker
          current={macro.color}
          anchor={picking}
          onPick={(i) => {
            onRecolor(i);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}

    </div>
  );
}
