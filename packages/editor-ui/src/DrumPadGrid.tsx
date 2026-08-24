import type { Chain } from '@rackutils/adg-codec';
import { noteName } from './noteName';
import type { RackPath } from './context';

export interface DrumPadGridProps {
  pads: readonly Chain[];
  rackPath: RackPath;
  renderChainBody: (chain: Chain) => React.ReactNode;
}

/**
 * A drum rack's pads (SCHEMA.md Q10, UI-PLAN Part 2.6 rule 2). Bundling
 * several functions into one rack and routing them through pads is a normal
 * way to organise a rack, so the pad layout is information the user put there.
 *
 * Ordered by `ReceivingNote`, ascending, NOT by document order - a real rack
 * stores them descending (92, 91, 90 in `drum-pads.adg`), so document order is
 * actively misleading. This is deliberately a note-ordered list of pads rather
 * than a reproduction of Live's 4x4 scrolling grid: the geometry behind
 * `PadScrollPosition` is unconfirmed (Q10) and guessing it would put pads in
 * confidently wrong places.
 */
export function DrumPadGrid({ pads, renderChainBody }: DrumPadGridProps) {
  const ordered = [...pads].sort((a, b) => (a.receivingNote ?? 0) - (b.receivingNote ?? 0));

  return (
    <div className="drum-pads">
      {ordered.map((pad) => (
        <section className="drum-pad" key={pad.path}>
          <header className="drum-pad-head">
            <span className="pad-note" title={`Receiving note ${pad.receivingNote}`}>
              {pad.receivingNote === null ? '-' : noteName(pad.receivingNote)}
            </span>
            <span className="pad-name">{pad.name || 'Pad'}</span>
            {pad.chokeGroup ? <span className="pad-choke">choke {pad.chokeGroup}</span> : null}
          </header>
          <div className="drum-pad-body">{renderChainBody(pad)}</div>
        </section>
      ))}
    </div>
  );
}
