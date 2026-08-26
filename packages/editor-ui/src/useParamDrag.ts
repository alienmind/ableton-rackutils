import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ParamRef } from '@rackutils/adg-codec';
import type { RackPath } from './context';
import { armDrag } from './holdToDrag';

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
export interface Point {
  x: number;
  y: number;
}

export interface ParamDragState {
  param: ParamRef | null;
  rackPath: RackPath | null;
  /** Macro index under the pointer, or null. */
  overMacro: number | null;
  /** True when the knob under the pointer belongs to a DIFFERENT rack, which cannot be bound (SCHEMA.md Q2). */
  overForeignRack: boolean;
  /**
   * True when the knob under the pointer ALREADY drives this parameter.
   *
   * Dropping there changes nothing - a parameter has one macro (Constraint 5)
   * and this is that macro - so the gesture has to say so rather than play a
   * connect animation over the cable that is already there, which drew two
   * lines into one knob.
   */
  overBound: boolean;
  /** Where the cable is plugged in: the parameter it was pulled from. Viewport coordinates. */
  origin: Point | null;
  /** Where the free end currently is. Viewport coordinates. */
  pointer: Point | null;
  /** The colour of the knob under the pointer, so the cable can take it. Null when over nothing. */
  overColor: string | null;
}

/**
 * What became of a cable once the pointer came up: it either reached a knob
 * and stays there wobbling, or it snaps back to where it was pulled from.
 * Purely visual - the binding itself has already happened by this point.
 */
export interface CableEcho {
  id: number;
  from: Point;
  to: Point;
  connected: boolean;
  /** The colour of the knob it landed on, so a connected cable matches it. */
  color: string | null;
}

const IDLE: ParamDragState = {
  param: null,
  rackPath: null,
  overMacro: null,
  overForeignRack: false,
  overBound: false,
  origin: null,
  pointer: null,
  overColor: null,
};

export interface UseParamDragOptions {
  onBind: (rackPath: RackPath, macroIndex: number, param: ParamRef) => void;
}

/** The rack a knob belongs to, read off the DOM - `data-rack-path` is written by MacroBank. */
function rackPathUnder(el: Element | null | undefined): string | null {
  return el?.closest('[data-rack-path]')?.getAttribute('data-rack-path') ?? null;
}

export function useParamDrag({ onBind }: UseParamDragOptions) {
  const [state, setState] = useState<ParamDragState>(IDLE);
  const [echo, setEcho] = useState<CableEcho | null>(null);
  const echoId = useRef(0);

  const handler = useRef(onBind);
  useLayoutEffect(() => {
    handler.current = onBind;
  });

  const active = useRef<{ param: ParamRef; rackPath: RackPath; origin: Point } | null>(null);
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
      // The cable hangs from the middle of the control it was pulled out of,
      // not from wherever the pointer happened to land on it. Measured HERE
      // rather than inside the arming callback: `currentTarget` is null once
      // the handler has returned.
      const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const origin = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      // Same hold as the knobs: on touch this gesture is how the rack scrolls.
      armDrag(e, () => {
        active.current = { param, rackPath, origin };
        setEcho(null);
        setState({
          param,
          rackPath,
          overMacro: null,
          overForeignRack: false,
          overBound: false,
          origin,
          pointer: origin,
          overColor: null,
        });

        const key = rackPath.join('|');

        const locate = (x: number, y: number) => {
          const el = document.elementFromPoint(x, y);
          const knob = el?.closest('[data-macro-index]') ?? null;
          if (!knob) return { macro: null as number | null, foreign: false, knob, color: null as string | null };
          const macro = Number(knob.getAttribute('data-macro-index'));
          // The knob publishes its macro's colour as a custom property; the
          // cable takes it so a patch reads as belonging to that macro.
          const color = getComputedStyle(knob).getPropertyValue('--macro-color').trim() || null;
          return { macro, foreign: rackPathUnder(knob) !== key, knob, color };
        };

        const move = (ev: PointerEvent) => {
          const { macro, foreign, color } = locate(ev.clientX, ev.clientY);
          setState((s) => ({
            ...s,
            overMacro: macro,
            overForeignRack: foreign,
            overBound: macro !== null && !foreign && param.boundToMacro === macro,
            overColor: color,
            pointer: { x: ev.clientX, y: ev.clientY },
          }));
        };

        const finish = (ev: PointerEvent) => {
          const dragged = active.current;
          const { macro, foreign, knob, color } = locate(ev.clientX, ev.clientY);
          stop();
          if (!dragged) return;

          // A macro can only drive a parameter in its OWN rack (SCHEMA.md Q2's
          // owning-rack walk), so a drop onto another rack's knob does nothing
          // rather than writing a mapping the file cannot express.
          const bound = macro !== null && !foreign;

          // Dropped back on the macro it already drives: nothing to write, and
          // nothing to animate either. The cable for that pair is already on
          // screen in Map mode, and a connect echo over it read as two cables
          // arriving at one knob.
          if (bound && dragged.param.boundToMacro === macro) return;

          const target = bound && knob ? centreOf(knob) : { x: ev.clientX, y: ev.clientY };
          echoId.current += 1;
          setEcho({ id: echoId.current, from: dragged.origin, to: target, connected: bound, color: bound ? color : null });
          if (bound) handler.current(dragged.rackPath, macro, dragged.param);
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
      });
    },
    [stop],
  );

  return { paramDrag: state, startParamDrag: startDrag, cableEcho: echo, clearCableEcho: () => setEcho(null) };
}

function centreOf(el: Element): Point {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}
