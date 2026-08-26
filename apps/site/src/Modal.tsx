import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A panel over the page, for the things that used to be paragraphs.
 *
 * The landing page explained itself at length - three screenshots of Live and
 * a paragraph about macOS quarantine - above the two controls anyone actually
 * came for. The explanations are still there; they are one `?` away instead of
 * in front of everyone who already knows.
 *
 * A portal, because the page's own boxes clip (`overflow: hidden` keeps a rack
 * one row tall) and a dialog inside one comes out sliced.
 */
export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', escape);
    // The page must not scroll behind the panel: on a phone that reads as the
    // dialog itself refusing to scroll.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', escape);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            x
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** The control that opens one. A question mark, because that is what it answers. */
export function HelpButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="help-button" onClick={onClick} title={label} aria-label={label}>
      ?
    </button>
  );
}
