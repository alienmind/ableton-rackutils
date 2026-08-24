import { useCallback, useMemo, useState } from 'react';
import { Rack, type MutationResult } from '@rackutils/adg-codec';
import { RackPanel } from './RackPanel';
import { EditorProvider, resolveRackPath, type ArmedParam, type RackPath } from './context';

export interface RackEditorProps {
  /** The loaded rack, owned by the host so it can decide how a file is opened (picker, drop, M4L path). */
  rack: Rack | null;
  onChange: (rack: Rack) => void;
  /** Live macro values from the M4L device, root rack only, display only - never written to the file. */
  liveValues?: Record<number, number>;
}

/**
 * Editing shell: undo stack, warnings, and the armed-parameter state, wrapped
 * around one recursive `RackPanel`.
 *
 * Every mutation goes through `apply` so undo and warnings can never be
 * forgotten by a new interaction, and every read (`macros`, `chains`) is
 * derived from the current handle on each render rather than mirrored into
 * React state (UI-PLAN Part 2.5).
 */
export function RackEditor({ rack, onChange, liveValues }: RackEditorProps) {
  const [undo, setUndo] = useState<Rack[]>([]);
  const [armed, setArmed] = useState<ArmedParam | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const apply = useCallback(
    (rackPath: RackPath, fn: (target: Rack) => MutationResult) => {
      if (!rack) return;
      const target = resolveRackPath(rack, rackPath);
      if (!target) {
        setWarnings([`that rack is no longer where it was - reload the file`]);
        return;
      }
      const previous = rack.clone();
      let result: MutationResult;
      try {
        result = fn(target);
      } catch (err) {
        // A mutation that throws (an out-of-range index, say) is a bug, but it
        // must not take the editor down with it or leave a half-applied edit
        // presented as success.
        setWarnings([err instanceof Error ? err.message : String(err)]);
        return;
      }
      setWarnings(result.warnings);
      if (!result.ok) return;
      setUndo((u) => [...u.slice(-49), previous]);
      // `target` mutated the document `rack` owns; clone so React sees a new
      // reference and every derived read recomputes.
      onChange(rack.clone());
    },
    [rack, onChange],
  );

  const context = useMemo(
    () => ({ armed, arm: setArmed, apply, liveValues }),
    [armed, apply, liveValues],
  );

  if (!rack) return null;

  return (
    <EditorProvider value={context}>
      <div className="rack-editor">
        <div className="editor-toolbar">
          <button
            type="button"
            disabled={undo.length === 0}
            onClick={() => {
              const previous = undo.at(-1);
              if (!previous) return;
              setUndo((u) => u.slice(0, -1));
              setWarnings([]);
              onChange(previous);
            }}
          >
            Undo{undo.length > 0 ? ` (${undo.length})` : ''}
          </button>
          {armed && (
            <span className="armed-note">
              <strong>{armed.param.name}</strong> armed - click a macro knob in the same rack to bind it
              <button type="button" className="cancel-arm" onClick={() => setArmed(null)}>
                cancel
              </button>
            </span>
          )}
        </div>

        {warnings.length > 0 && (
          <ul className="warnings">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        <div className="rack-editor-scroll">
          <RackPanel rack={rack} rackPath={[]} depth={0} />
        </div>
      </div>
    </EditorProvider>
  );
}
