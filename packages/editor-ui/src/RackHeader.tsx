import { useState } from 'react';
import { MACRO_SLOTS } from '@rackutils/adg-codec';

export interface RackHeaderProps {
  name: string;
  macroCount: number;
  /** Drum racks say so, since they render their chains as pads rather than as a chain list. */
  kind: string;
  depth: number;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  onRename: (name: string) => void;
  onSetMacroCount: (count: number) => void;
}

export function RackHeader({ name, macroCount, kind, depth, collapsible, open, onToggle, onRename, onSetMacroCount }: RackHeaderProps) {
  const [editing, setEditing] = useState(false);

  return (
    <header className="rack-header" data-depth={depth}>
      {collapsible && (
        <button type="button" className="rack-disclosure" onClick={onToggle} aria-expanded={open}>
          {open ? '▾' : '▸'}
        </button>
      )}
      {editing ? (
        <input
          className="rack-name-input"
          autoFocus
          defaultValue={name}
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
        <h3 className="rack-name" onDoubleClick={() => setEditing(true)} title="Double-click to rename">
          {name}
        </h3>
      )}
      <span className="rack-kind">{kind}</span>
      <div className="macro-count">
        <button type="button" disabled={macroCount <= 1} onClick={() => onSetMacroCount(macroCount - 1)} title="Fewer macros">
          -
        </button>
        <span title="Visible macros">{macroCount}</span>
        <button type="button" disabled={macroCount >= MACRO_SLOTS} onClick={() => onSetMacroCount(macroCount + 1)} title="More macros">
          +
        </button>
      </div>
    </header>
  );
}
