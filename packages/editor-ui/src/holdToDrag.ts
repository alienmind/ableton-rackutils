/**
 * Starting a drag on a touch screen, where the same gesture is how you scroll.
 *
 * The rack is one row that scrolls sideways, and most of what is in that row -
 * every knob, every bindable parameter - is also draggable. With
 * `touch-action: none` on those, which is what a pointer drag normally needs,
 * a finger on a knob could not scroll the rack at all: the row had a scrollbar
 * and no way to move it, which is most of a phone screen unusable.
 *
 * So on touch the browser keeps the gesture and the drag waits: hold still for
 * `HOLD_MS` and the drag begins, move before that and it never does and the
 * page scrolls as it should. Once a drag has begun, `touchmove` is cancelled
 * for as long as it lasts - the finger has not moved yet, so no native scroll
 * is under way to fight with.
 *
 * A mouse or a pen starts immediately. There is nothing to disambiguate.
 */
const HOLD_MS = 350;
/** How far a finger may wander during the hold before it is a scroll, not a drag. */
const SLOP_PX = 10;

export function armDrag(e: React.PointerEvent, begin: () => void): void {
  if (e.pointerType !== 'touch') {
    begin();
    return;
  }

  const { clientX, clientY } = e;
  const abandon = () => {
    window.clearTimeout(timer);
    window.removeEventListener('pointermove', watch);
    window.removeEventListener('pointerup', abandon);
    window.removeEventListener('pointercancel', abandon);
  };
  const watch = (ev: PointerEvent) => {
    if (Math.hypot(ev.clientX - clientX, ev.clientY - clientY) > SLOP_PX) abandon();
  };
  const timer = window.setTimeout(() => {
    abandon();
    holdScrollStill();
    begin();
  }, HOLD_MS);

  window.addEventListener('pointermove', watch);
  window.addEventListener('pointerup', abandon);
  window.addEventListener('pointercancel', abandon);
}

/**
 * Keep the page still for the length of a touch drag.
 *
 * `touch-action` is read when the gesture starts, so it cannot be changed once
 * a finger is down. Cancelling `touchmove` can, and it works here because the
 * hold means no scroll has started to be cancelled.
 */
function holdScrollStill(): void {
  const prevent = (ev: TouchEvent) => ev.preventDefault();
  const release = () => {
    window.removeEventListener('touchmove', prevent);
    window.removeEventListener('pointerup', release);
    window.removeEventListener('pointercancel', release);
  };
  window.addEventListener('touchmove', prevent, { passive: false });
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
}
