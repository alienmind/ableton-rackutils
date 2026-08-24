import type { Chain } from '@rackutils/adg-codec';
import { noteName } from './noteName';
import type { RackPath } from './context';

export interface DrumPadGridProps {
  pads: readonly Chain[];
  rackPath: RackPath;
  renderChainBody: (chain: Chain) => React.ReactNode;
}

/**
 * A drum rack's pads (SCHEMA.md Q10, UI-PLAN Part 2.6 rule 2), drawn as Live's
 * chain list is: a narrow column of named rows beside the device area, one row
 * per pad, with the selected pad's devices shown to its right.
 *
 * Ordered by `ReceivingNote`, ascending, NOT by document order - a real rack
 * stores them descending (92, 91, 90 in `drum-pads.adg`), so document order is
 * actively misleading. Not yet Live's 4x4 scrolling pad grid: the geometry
 * behind `PadScrollPosition` is unconfirmed (Q10) and guessing it would put
 * pads in confidently wrong places.
 */
export function DrumPadGrid({ pads, renderChainBody }: DrumPadGridProps) {
  const ordered = [...pads].sort((a, b) => (a.receivingNote ?? 0) - (b.receivingNote ?? 0));

  return (
    <div className="drum-pads">
      {ordered.map((pad) => (
        <div className="chain-lane drum-pad" key={pad.path}>
          <span className="pad-note" title={`Receiving note ${pad.receivingNote}`}>
            {pad.receivingNote === null ? '-' : noteName(pad.receivingNote)}
          </span>
          <span className="pad-name" title={pad.name || 'Pad'}>
            {pad.name || 'Pad'}
          </span>
          {pad.chokeGroup ? <span className="pad-choke">ch{pad.chokeGroup}</span> : null}
          <div className="device-strip">{renderChainBody(pad)}</div>
        </div>
      ))}
    </div>
  );
}
