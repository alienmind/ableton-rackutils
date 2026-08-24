import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Pointer-based drag for the macro grid, NOT the HTML5 drag-and-drop API.
 *
 * HTML5 DnD was the first implementation and it did not work in a browser: a
 * knob picked up and dragged fine, and dropping did nothing. It also swallowed
 * clicks on the buttons inside a `draggable` element, which took the unbind
 * "x" and the colour swatch down with it. The same components have to run
 * inside the Max `jweb` webview later, where HTML5 DnD is not something to
 * rely on either.
 *
 * The window listeners are attached IN the pointerdown handler, not from an
 * effect that runs after the resulting render. An effect loses fast gestures:
 * pointerup can arrive before React has committed, and the drop is silently
 * dropped. That showed up as two flaky-looking browser tests and would hit any
 * user who flicks a knob quickly.
 */
export interface MacroDragState {
  /** Index being dragged, or null. */
  from: number | null;
  /** Index currently under the pointer, or null. */
  over: number | null;
  /** Shift held, so the drop swaps instead of reordering. */
  swap: boolean;
}

const IDLE: MacroDragState = { from: null, over: null, swap: false };

export interface UseMacroDragOptions {
  onReorder: (from: number, to: number) => void;
  onSwap: (a: number, b: number) => void;
}

function indexUnder(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-macro-index]');
  const raw = el?.getAttribute('data-macro-index');
  return raw === null || raw === undefined ? null : Number(raw);
}

export function useMacroDrag({ onReorder, onSwap }: UseMacroDragOptions) {
  const [state, setState] = useState<MacroDragState>(IDLE);

  // Callbacks read through a ref so the listeners never need reattaching when
  // a re-render hands us new ones mid-drag.
  const handlers = useRef({ onReorder, onSwap });
  useLayoutEffect(() => {
    handlers.current = { onReorder, onSwap };
  });

  const from = useRef<number | null>(null);
  const detach = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    detach.current?.();
    detach.current = null;
    from.current = null;
    setState(IDLE);
  }, []);

  // Only for a component unmounted mid-gesture; the normal path detaches in `stop`.
  useEffect(() => stop, [stop]);

  const startDrag = useCallback(
    (index: number, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      from.current = index;
      setState({ from: index, over: index, swap: e.shiftKey });

      const move = (ev: PointerEvent) => {
        const over = indexUnder(ev.clientX, ev.clientY);
        setState((s) => (s.over === over && s.swap === ev.shiftKey ? s : { ...s, over, swap: ev.shiftKey }));
      };

      const finish = (ev: PointerEvent) => {
        const source = from.current;
        const target = indexUnder(ev.clientX, ev.clientY);
        stop();
        if (source === null || target === null || source === target) return;
        if (ev.shiftKey) handlers.current.onSwap(source, target);
        else handlers.current.onReorder(source, target);
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

  return { drag: state, startDrag };
}
