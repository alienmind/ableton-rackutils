import { useCallback, useMemo, useState } from 'react';
import { Rack, bindParameter, type MutationResult } from '@rackutils/adg-codec';
import { RackPanel } from './RackPanel';
import { EditorProvider, resolveRackPath, type ArmedParam, type RackPath } from './context';
import { PatchCable } from './PatchCable';
import { useParamDrag } from './useParamDrag';

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
  const [redo, setRedo] = useState<Rack[]>([]);
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
      // A new edit invalidates anything that was undone: the branch it would
      // redo onto no longer exists.
      setRedo([]);
      // `target` mutated the document `rack` owns; clone so React sees a new
      // reference and every derived read recomputes.
      onChange(rack.clone());
    },
    [rack, onChange],
  );

  const { paramDrag, startParamDrag, cableEcho, clearCableEcho } = useParamDrag({
    onBind: (rackPath, macroIndex, param) => apply(rackPath, (r) => bindParameter(r, macroIndex, param)),
  });

  const history = useMemo(
    () => ({
      canUndo: undo.length > 0,
      canRedo: redo.length > 0,
      undo: () => {
        const previous = undo.at(-1);
        if (!previous || !rack) return;
        setUndo((u) => u.slice(0, -1));
        setRedo((r) => [...r.slice(-49), rack.clone()]);
        setWarnings([]);
        onChange(previous);
      },
      redo: () => {
        const next = redo.at(-1);
        if (!next || !rack) return;
        setRedo((r) => r.slice(0, -1));
        setUndo((u) => [...u.slice(-49), rack.clone()]);
        setWarnings([]);
        onChange(next);
      },
    }),
    [undo, redo, rack, onChange],
  );

  const context = useMemo(
    () => ({ armed, arm: setArmed, apply, liveValues, paramDrag, startParamDrag, history }),
    [armed, apply, liveValues, paramDrag, startParamDrag, history],
  );

  if (!rack) return null;

  return (
    <EditorProvider value={context}>
      <div className="rack-editor">
        <div className="editor-toolbar">
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
        <PatchCable drag={paramDrag} echo={cableEcho} onEchoDone={clearCableEcho} />
      </div>
    </EditorProvider>
  );
}
