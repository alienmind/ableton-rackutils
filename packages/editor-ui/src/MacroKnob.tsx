import { useState } from 'react';
import type { Macro } from '@rackutils/adg-codec';
import { arcPath, KNOB_MAX_DEG, KNOB_MIN_DEG, valueToDegrees } from './arc';
import { ColorPicker } from './ColorPicker';
import { contrastInk, macroColor } from './macroColors';
import { macroLabel } from './mappings';

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
  /** Map mode, and this knob can be dragged onto a knob of the rack above it (SCHEMA.md Q22). */
  mapSource?: boolean;
  /** Where a cable can find this knob: its own address, plus the one its parent addresses it by. Space separated (see `MappingCables`). */
  mapKeys: string;
  onDragStart: (e: React.PointerEvent) => void;
  onClick: () => void;
  onRename: (name: string) => void;
  onRecolor: (colorIndex: number) => void;
  /** Unbind this macro and put its name and colour back to an untouched slot's. */
  onReset: () => void;
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
  const { macro, liveValue, armed, hidden, dragging, dropTarget, dropSwaps, bindTarget, mapSource, mapKeys } = props;
  const { onDragStart, onClick, onRename, onRecolor, onReset } = props;
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState<DOMRect | null>(null);

  const mapped = macro.bindings.length > 0;
  const color = macroColor(macro.color);
  const angle = valueToDegrees(macro.value);
  // Live labels a macro nobody has named after the thing it drives, which is
  // what makes a rack of racks readable: the parent's knob reads KICK SEL
  // because that is the child macro at the other end (SCHEMA.md Q23).
  const label = macroLabel(macro);
  const derived = label !== macro.name;

  const classes = ['macro-knob', mapped ? 'mapped' : 'unmapped'];
  if (mapSource) classes.push('map-source');
  if (armed) classes.push('bindable');
  if (hidden) classes.push('hidden-slot');
  if (dragging) classes.push('dragging');
  if (dropTarget) classes.push(dropSwaps ? 'drop-swap' : 'drop-reorder');
  if (bindTarget) classes.push('bind-target');

  return (
    <div
      className={classes.join(' ')}
      data-macro-index={macro.index}
      data-map-key={mapKeys}
      // The label sits ON the macro's colour, and the palette runs from near
      // black to white, so the ink has to be picked per knob.
      style={{ '--macro-color': color, '--macro-ink': contrastInk(color) } as React.CSSProperties}
    >
      <div
        className="macro-knob-dial"
        onPointerDown={onDragStart}
        onClick={onClick}
        title={
          armed
            ? 'Bind the armed parameter here'
            : mapSource
              ? "Drag onto a knob of the rack above to have it drive this macro"
              : 'Drag to move, Shift-drag to swap'
        }
      >
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
          defaultValue={label}
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
        <span
          className={derived ? 'macro-knob-name derived' : 'macro-knob-name'}
          onDoubleClick={() => setEditing(true)}
          title={derived ? `${label} - named after what it drives; double-click to give it a name` : `${macro.name} - double-click to rename`}
        >
          {label}
        </span>
      )}

      {/* Only on a macro there is something to undo: an untouched slot has
          nothing to reset, and the control would be noise on all sixteen. */}
      {(mapped || label !== `Macro ${macro.index + 1}` || macro.color >= 0) && (
        <button type="button" className="macro-knob-reset" onClick={onReset} title="Unbind this macro and reset its name and colour">
          x<span className="sr-only">{` reset macro ${macro.index + 1}`}</span>
        </button>
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
