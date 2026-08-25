import { createContext, useContext } from 'react';
import type { MutationResult, ParamRef, Rack } from '@rackutils/adg-codec';
import type { ParamDragState } from './useParamDrag';

/**
 * Which rack a panel is showing, as the chain of device paths from the root
 * rack down to it: `[]` is the root, `['0/1']` is the rack at that device
 * path, `['0/1', '0/0']` a rack inside that one.
 *
 * Stored as a path rather than a `Rack` handle on purpose. Every mutation
 * replaces the root handle (that is how React learns to re-render), which
 * makes any handle captured earlier stale. A path stays valid, and
 * `resolveRackPath` turns it back into a live handle against the current root.
 */
export type RackPath = readonly string[];

export function resolveRackPath(root: Rack, path: RackPath): Rack | null {
  let rack: Rack | null = root;
  for (const devicePath of path) {
    rack = rack.subRack(devicePath);
    if (!rack) return null;
  }
  return rack;
}

export const samePath = (a: RackPath, b: RackPath) => a.length === b.length && a.every((p, i) => p === b[i]);

/**
 * A parameter waiting to be bound to the next macro clicked, together with the
 * rack it belongs to - a `ParamRef.path` only resolves against its own rack,
 * so the two must travel together.
 */
export interface ArmedParam {
  rackPath: RackPath;
  param: ParamRef;
}

export interface EditorContextValue {
  /**
   * The root rack. A nested rack's macro is bound BY ITS PARENT (SCHEMA.md
   * Q22), so a panel offering its own knobs as mapping sources has to address
   * them from one level up, and only the root can resolve that.
   */
  root: Rack;
  /**
   * Live's Map mode. Off, a drag on a knob moves the macro and a drag on a
   * parameter does nothing; on, every parameter and every nested rack's macro
   * is a source to drag onto a knob.
   *
   * Modal on purpose, and requested as such: the two gestures start the same
   * way, so one of them has to say which it is. Live draws the same button on
   * the rack's title bar for the same reason.
   */
  mapping: boolean;
  setMapping: (on: boolean) => void;
  armed: ArmedParam | null;
  /** Live state of a parameter being dragged onto a knob, and the way to start one. */
  paramDrag: ParamDragState;
  startParamDrag: (param: ParamRef, rackPath: RackPath, e: React.PointerEvent) => void;
  arm: (armed: ArmedParam | null) => void;
  /** Run a mutation against the rack at `rackPath`, recording undo and surfacing warnings. */
  apply: (rackPath: RackPath, fn: (rack: Rack) => MutationResult) => void;
  /** Live macro values from the M4L device, keyed by macro index. Root rack only, display only. */
  liveValues?: Record<number, number>;
  /**
   * Undo/redo is global: one history across every rack level, because a
   * mutation on a nested rack edits the same document as one on the root.
   * Only the root rack's title bar shows the buttons.
   */
  history: {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
  };
}

const EditorContext = createContext<EditorContextValue | null>(null);

export const EditorProvider = EditorContext.Provider;

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('editor-ui components must be rendered inside a RackEditor');
  return ctx;
}
