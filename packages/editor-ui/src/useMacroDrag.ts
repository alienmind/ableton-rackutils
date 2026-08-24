import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Pointer-based drag for the macro grid, NOT the HTML5 drag-and-drop API.
 *
 * HTML5 DnD was the first implementation and it did not work: a knob picked up
 * and dragged fine, and dropping did nothing. It also swallowed clicks on the
 * buttons inside a `draggable` element, which took the unbind "x" and the
 * colour swatch down with it. On top of that the same components have to run
 * inside the Max `jweb` webview later, where HTML5 DnD is not something to
 * rely on.
 *
 * Pointer events have none of that: no drag images, no data-transfer MIME
 * negotiation, no interaction with click handling. `setPointerCapture` keeps
 * the gesture even when the pointer leaves the element, and the drop target is
 * resolved from the element under the pointer.
 *
 * The window listeners are attached once per gesture and read their callbacks
 * through a ref, so a re-render mid-drag does not detach and reattach them
 * (the pattern trackster's `useKnobInteraction` documents).
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

export function useMacroDrag({ onReorder, onSwap }: UseMacroDragOptions) {
  const [state, setState] = useState<MacroDragState>(IDLE);

  const handlers = useRef({ onReorder, onSwap });
  useLayoutEffect(() => {
    handlers.current = { onReorder, onSwap };
  });

  const live = useRef(IDLE);
  live.current = state;

  const dragging = state.from !== null;

  useEffect(() => {
    if (!dragging) return;

    const indexUnder = (x: number, y: number): number | null => {
      const el = document.elementFromPoint(x, y)?.closest('[data-macro-index]');
      const raw = el?.getAttribute('data-macro-index');
      return raw === null || raw === undefined ? null : Number(raw);
    };

    const move = (e: PointerEvent) => {
      const over = indexUnder(e.clientX, e.clientY);
      setState((s) => (s.over === over && s.swap === e.shiftKey ? s : { ...s, over, swap: e.shiftKey }));
    };

    const finish = (e: PointerEvent) => {
      const { from } = live.current;
      const to = indexUnder(e.clientX, e.clientY);
      setState(IDLE);
      if (from === null || to === null || from === to) return;
      if (e.shiftKey) handlers.current.onSwap(from, to);
      else handlers.current.onReorder(from, to);
    };

    const cancel = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState(IDLE);
    };

    const abandon = () => setState(IDLE);

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', abandon);
    window.addEventListener('keydown', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', abandon);
      window.removeEventListener('keydown', cancel);
    };
  }, [dragging]);

  /**
   * Attach to a knob's drag handle. Only a primary-button press starts a drag,
   * and the press is not swallowed: a press with no movement still ends as a
   * plain click on whatever was under it.
   */
  const startDrag = useCallback((index: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setState({ from: index, over: index, swap: e.shiftKey });
  }, []);

  return { drag: state, startDrag };
}
