import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PALETTE_INDICES, macroColor } from './macroColors';

export interface ColorPickerProps {
  current: number;
  /** The control the popover hangs off - its on-screen box decides where the grid appears. */
  anchor: DOMRect | null;
  onPick: (colorIndex: number) => void;
  onClose: () => void;
}

/**
 * Swatch popover: Live's own 70 colours, laid out 14 wide as Live lays them
 * out (`macroColors.ts`). Whether a swatch's position here is the index Live
 * stores is still unconfirmed - see SCHEMA.md Q13.
 *
 * Rendered into a PORTAL, not inline. Every panel in this layout sets
 * `overflow: hidden` so a rack cannot grow past one device row, which also
 * clips anything that tries to overhang it - the picker came out sliced in
 * half. A portal plus fixed positioning steps outside the clipping entirely.
 */
export function ColorPicker({ current, anchor, onPick, onClose }: ColorPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!anchor || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    // Flip rather than overflow: near the right or bottom edge the grid opens
    // back towards the middle instead of off screen.
    const left = Math.max(4, Math.min(anchor.left, window.innerWidth - box.width - 4));
    const below = anchor.bottom + 2;
    const above = anchor.top - box.height - 2;
    // Prefer below, flip above when it would overflow - then clamp into the
    // viewport regardless. The anchor can be off screen entirely (the editor
    // sits below the fold on a short window), and a `position: fixed` popover
    // placed off screen cannot be scrolled back into view: it is simply
    // unclickable.
    const preferred = anchor.bottom + box.height > window.innerHeight ? above : below;
    const top = Math.max(4, Math.min(preferred, window.innerHeight - box.height - 4));
    setPlaced({ left, top });
  }, [anchor]);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // Deferred: the click that opened this popover is still travelling.
    const timer = setTimeout(() => window.addEventListener('pointerdown', away), 0);
    window.addEventListener('keydown', escape);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="color-picker"
      style={{ left: placed?.left ?? anchor?.left ?? 0, top: placed?.top ?? anchor?.bottom ?? 0, visibility: placed ? 'visible' : 'hidden' }}
    >
      {PALETTE_INDICES.map((i) => (
        <button
          key={i}
          type="button"
          className={`color-swatch${i === current ? ' current' : ''}`}
          style={{ background: macroColor(i) }}
          onClick={() => onPick(i)}
          title={`Colour ${i}`}
        >
          <span className="sr-only">{`Colour ${i}`}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
