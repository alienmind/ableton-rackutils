import { useState } from 'react';

export interface RackHeaderProps {
  name: string;
  /** Drum racks say so, since they render their chains as pads rather than as a chain list. */
  kind: string;
  depth: number;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  onRename: (name: string) => void;
  /** Undo/redo, on the ROOT rack's bar only - the history is global (see `context.tsx`). */
  history?: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
}

/**
 * A rack's title bar: its name, what kind of rack it is, and - on the root
 * rack only - undo and redo.
 *
 * The macro count control used to live here as `- 8 +`. It is gone: the same
 * two buttons sit in the rack's left-hand column where Live puts them, and one
 * control in two places is one too many.
 */
export function RackHeader({ name, kind, depth, collapsible, open, onToggle, onRename, history }: RackHeaderProps) {
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

      {history && (
        <div className="history-buttons">
          <button type="button" disabled={!history.canUndo} onClick={history.undo} title="Undo (all racks)">
            ↶
          </button>
          <button type="button" disabled={!history.canRedo} onClick={history.redo} title="Redo (all racks)">
            ↷
          </button>
        </div>
      )}
    </header>
  );
}
