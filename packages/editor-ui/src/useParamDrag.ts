import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ParamRef } from '@rackutils/adg-codec';
import type { RackPath } from './context';

/**
 * Drag a parameter onto a macro knob to bind it - the gesture people reach for
 * first, and the one that was missing: binding used to be click-to-arm then
 * click-a-knob, which the project owner tried and could not find.
 *
 * Click-to-arm still works. It is the only way to bind with a keyboard or on a
 * small screen, and it is what the "armed" banner explains.
 *
 * Same pointer-event approach as `useMacroDrag`, and the same reason: HTML5
 * drag-and-drop does not work here and cannot be relied on inside the Max
 * `jweb` webview. Listeners attach in the pointerdown handler rather than from
 * an effect, so a fast drag cannot finish before they exist.
 */
export interface ParamDragState {
  param: ParamRef | null;
  rackPath: RackPath | null;
  /** Macro index under the pointer, or null. */
  overMacro: number | null;
  /** True when the knob under the pointer belongs to a DIFFERENT rack, which cannot be bound (SCHEMA.md Q2). */
  overForeignRack: boolean;
}

const IDLE: ParamDragState = { param: null, rackPath: null, overMacro: null, overForeignRack: false };

export interface UseParamDragOptions {
  onBind: (rackPath: RackPath, macroIndex: number, param: ParamRef) => void;
}

/** The rack a knob belongs to, read off the DOM - `data-rack-path` is written by MacroBank. */
function rackPathUnder(el: Element | null | undefined): string | null {
  return el?.closest('[data-rack-path]')?.getAttribute('data-rack-path') ?? null;
}

export function useParamDrag({ onBind }: UseParamDragOptions) {
  const [state, setState] = useState<ParamDragState>(IDLE);

  const handler = useRef(onBind);
  useLayoutEffect(() => {
    handler.current = onBind;
  });

  const active = useRef<{ param: ParamRef; rackPath: RackPath } | null>(null);
  const detach = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    detach.current?.();
    detach.current = null;
    active.current = null;
    setState(IDLE);
  }, []);

  const startDrag = useCallback(
    (param: ParamRef, rackPath: RackPath, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      active.current = { param, rackPath };
      setState({ param, rackPath, overMacro: null, overForeignRack: false });

      const key = rackPath.join('|');

      const locate = (x: number, y: number) => {
        const el = document.elementFromPoint(x, y);
        const knob = el?.closest('[data-macro-index]');
        if (!knob) return { macro: null as number | null, foreign: false };
        const macro = Number(knob.getAttribute('data-macro-index'));
        return { macro, foreign: rackPathUnder(knob) !== key };
      };

      const move = (ev: PointerEvent) => {
        const { macro, foreign } = locate(ev.clientX, ev.clientY);
        setState((s) => (s.overMacro === macro && s.overForeignRack === foreign ? s : { ...s, overMacro: macro, overForeignRack: foreign }));
      };

      const finish = (ev: PointerEvent) => {
        const dragged = active.current;
        const { macro, foreign } = locate(ev.clientX, ev.clientY);
        stop();
        // A macro can only drive a parameter in its OWN rack (SCHEMA.md Q2's
        // owning-rack walk), so a drop onto another rack's knob does nothing
        // rather than writing a mapping the file cannot express.
        if (!dragged || macro === null || foreign) return;
        handler.current(dragged.rackPath, macro, dragged.param);
      };

      const cancel = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') stop();
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', stop);
      window.addEventListener('keydown', cancel);
      detach.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', stop);
        window.removeEventListener('keydown', cancel);
      };
    },
    [stop],
  );

  return { paramDrag: state, startParamDrag: startDrag };
}
