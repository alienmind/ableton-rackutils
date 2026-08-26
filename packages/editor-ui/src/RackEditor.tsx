import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Rack, bindParameter, type MutationResult } from '@rackutils/adg-codec';
import { RackPanel } from './RackPanel';
import { EditorProvider, resolveRackPath, type ArmedParam, type RackPath } from './context';
import { MappingTable } from './MappingTable';
import { PatchCable } from './PatchCable';
import { MappingCables, mapKey } from './MappingCables';
import { ContractStrip } from './ContractStrip';
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
 * React state (doc/PLAN.md Part 5).
 */
export function RackEditor({ rack, onChange, liveValues }: RackEditorProps) {
  const [undo, setUndo] = useState<Rack[]>([]);
  const [redo, setRedo] = useState<Rack[]>([]);
  const [armed, setArmed] = useState<ArmedParam | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [mapping, setMappingState] = useState(false);

  // Leaving Map mode drops whatever was armed: an armed parameter waiting for
  // a knob that can no longer take it is a mode with no way out of it.
  const setMapping = useCallback((on: boolean) => {
    setMappingState(on);
    if (!on) setArmed(null);
  }, []);

  const apply = useCallback(
    (rackPath: RackPath, fn: (target: Rack) => MutationResult): boolean => {
      if (!rack) return false;
      const target = resolveRackPath(rack, rackPath);
      if (!target) {
        setWarnings([`that rack is no longer where it was - reload the file`]);
        return false;
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
        return false;
      }
      setWarnings(result.warnings);
      if (!result.ok) return false;
      setUndo((u) => [...u.slice(-49), previous]);
      // A new edit invalidates anything that was undone: the branch it would
      // redo onto no longer exists.
      setRedo([]);
      // `target` mutated the document `rack` owns; clone so React sees a new
      // reference and every derived read recomputes.
      onChange(rack.clone());
      return true;
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

  const scroller = useRef<HTMLDivElement>(null);
  const openBudget = useOpenBudget(scroller);

  const context = useMemo(
    () => ({ root: rack!, mapping, setMapping, armed, arm: setArmed, apply, liveValues, openBudget, paramDrag, startParamDrag, history }),
    [rack, mapping, setMapping, armed, apply, liveValues, openBudget, paramDrag, startParamDrag, history],
  );

  if (!rack) return null;

  return (
    <EditorProvider value={context}>
      <div className="rack-editor">
        {/*
          * One message line, always there.
          *
          * Warnings used to appear and disappear above the rack, which moved
          * everything under them by however many lines the codec had to say -
          * so the thing you were about to click was somewhere else by the time
          * you clicked it. The row keeps its height whether or not it has
          * anything in it, and it carries the mode notes too, since they are
          * the same kind of message.
          */}
        <div className={`editor-messages${warnings.length > 0 ? ' has-warning' : ''}`} role="status" aria-live="polite">
          {warnings.length > 0 ? (
            <ul className="warnings" title={warnings.join('\n')}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : armed ? (
            <span className="armed-note">
              <strong>{armed.param.name}</strong> armed - click a macro knob in the same rack to bind it
              <button type="button" className="cancel-arm" onClick={() => setArmed(null)}>
                cancel
              </button>
            </span>
          ) : mapping ? (
            <span className="mapping-note">
              Map mode - drag any parameter, or a nested rack's knob, onto a macro knob. Moving macros around
              is off until you leave it.
            </span>
          ) : null}
        </div>

        {/* The rack first and as wide as the window allows, then the two
            panels that read it, side by side under it - and stacked instead
            when there is not enough width for both. Only the rack needs the
            whole monitor; a feature list and a table of mappings are worse
            for being stretched across one. */}
        <div className="rack-editor-scroll" ref={scroller}>
          <div className="rack-row">
            <RackPanel rack={rack} rackPath={[]} depth={0} />
            {/* The empty slots a rack has room for. Live draws them too, and
                without them a rack narrower than the window sat in a box of
                dead space that read as a layout bug rather than as a rack
                with room in it. Decorative: nothing can be dropped here,
                devices come from Live. */}
            <div className="rack-filler" aria-hidden="true" />
          </div>
        </div>

        <div className="editor-panels">
          <ContractStrip rack={rack} />
          <MappingTable rack={rack} />
        </div>

        <MappingCables
          rack={rack}
          active={mapping}
          hidden={paramDrag.param && paramDrag.rackPath ? mapKey(paramDrag.rackPath, paramDrag.param.path) : null}
        />
        <PatchCable drag={paramDrag} echo={cableEcho} onEchoDone={clearCableEcho} />
      </div>
    </EditorProvider>
  );
}

/**
 * How many devices the row has room to show open, from the width it has.
 *
 * A rack is a row that scrolls sideways and every open device is about 210px
 * of it, so on a laptop a chain of six opened flat is mostly off screen. The
 * budget folds the ones that do not fit - from the right, so the devices
 * nearest the rack survive - and unfolds them again as the window grows.
 *
 * Deliberately a heuristic on a typical width rather than a measurement of
 * each panel: measuring means opening them all to see how wide they would be,
 * which is the thing being avoided. Getting it slightly wrong costs a
 * scrollbar, which is where this started.
 */
const RACK_PANEL_WIDTH = 560;
const OPEN_DEVICE_WIDTH = 210;

function useOpenBudget(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    // ResizeObserver rather than the window's resize event: the row also
    // changes width when the panels under it wrap, and that is not a resize.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return Math.max(0, Math.floor((width - RACK_PANEL_WIDTH) / OPEN_DEVICE_WIDTH));
}
