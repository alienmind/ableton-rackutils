import type { Chain } from '@rackutils/adg-codec';
import { noteName } from './noteName';

export interface ChainListProps {
  chains: readonly Chain[];
  selected: number;
  onSelect: (index: number) => void;
  /** Drum racks label rows with the pad's note and show them as a pad grid alongside. */
  drum: boolean;
}

/**
 * A rack's chain list: a narrow column of rows, one per chain, exactly one
 * selected - Live's own layout. Only the selected chain's devices are drawn,
 * which is what keeps a whole rack on ONE row no matter how many chains it
 * has. Rendering every chain's devices stacked was the first cut's mistake and
 * is what made a drum rack overflow the page.
 */
export function ChainList({ chains, selected, onSelect, drum }: ChainListProps) {
  // Pads are laid out by note, ascending. A real rack stores them in the
  // opposite order (92, 91, 90 in `drum-pads.adg`), so document order would
  // put the grid backwards. The ORIGINAL index travels with each entry -
  // selection indexes `rack.chains`, which is not reordered.
  const ordered = chains.map((chain, index) => ({ chain, index }));
  if (drum) ordered.sort((a, b) => (a.chain.receivingNote ?? 0) - (b.chain.receivingNote ?? 0));

  return (
    <div className="chain-list">
      {drum && (
        <div className="pad-grid">
          {ordered.map(({ chain, index }) => (
            <button
              key={chain.path}
              type="button"
              className={`pad${index === selected ? ' selected' : ''}`}
              onClick={() => onSelect(index)}
              title={`${chain.name || 'Pad'} - ${chain.receivingNote === null ? 'no note' : noteName(chain.receivingNote)}`}
            >
              {chain.receivingNote === null ? '-' : noteName(chain.receivingNote)}
            </button>
          ))}
        </div>
      )}
      <div className="chain-rows">
        {ordered.map(({ chain, index }) => (
          <button
            key={chain.path}
            type="button"
            className={`chain-row${index === selected ? ' selected' : ''}`}
            onClick={() => onSelect(index)}
            title={chain.name || 'Chain'}
          >
            {drum && chain.receivingNote !== null && <span className="chain-note">{noteName(chain.receivingNote)}</span>}
            <span className="chain-row-name">{chain.name || 'Chain'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
